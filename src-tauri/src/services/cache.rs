use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

type Entry<T> = Arc<tokio::sync::Mutex<Option<(Instant, T)>>>;

/// Shares in-flight requests as well as successful responses. Errors are never cached.
pub(super) struct RequestCache<T> {
    entries: Mutex<HashMap<String, Entry<T>>>,
    capacity: usize,
    ttl: Duration,
}

impl<T: Clone> RequestCache<T> {
    pub(super) fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            capacity,
            ttl,
        }
    }

    pub(super) async fn get_or_fetch<F, Fut>(&self, key: String, fetch: F) -> Result<T, String>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T, String>>,
    {
        let entry = {
            let mut entries = self.entries.lock().map_err(|e| e.to_string())?;
            if let Some(entry) = entries.get(&key) {
                Arc::clone(entry)
            } else {
                if entries.len() >= self.capacity {
                    let removable = entries
                        .iter()
                        .find(|(_, entry)| Arc::strong_count(entry) == 1)
                        .map(|(key, _)| key.clone());
                    if let Some(key) = removable {
                        entries.remove(&key);
                    }
                }
                let entry = Arc::new(tokio::sync::Mutex::new(None));
                if entries.len() < self.capacity {
                    entries.insert(key, Arc::clone(&entry));
                }
                entry
            }
        };
        let mut cached = entry.lock().await;
        if let Some((_, value)) = cached.as_ref().filter(|(at, _)| at.elapsed() < self.ttl) {
            return Ok(value.clone());
        }
        let value = fetch().await?;
        *cached = Some((Instant::now(), value.clone()));
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn concurrent_and_repeated_requests_share_one_fetch() {
        let cache = RequestCache::new(2, Duration::from_secs(60));
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            tokio::task::yield_now().await;
            Ok(42)
        };
        let (a, b) = tokio::join!(
            cache.get_or_fetch("same".into(), fetch),
            cache.get_or_fetch("same".into(), fetch)
        );
        assert_eq!((a.unwrap(), b.unwrap()), (42, 42));
        assert_eq!(cache.get_or_fetch("same".into(), fetch).await.unwrap(), 42);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn failed_or_expired_responses_are_refetched_and_storage_is_bounded() {
        let cache = RequestCache::<i32>::new(2, Duration::from_secs(60));
        assert!(cache
            .get_or_fetch("error".into(), || async { Err("offline".into()) })
            .await
            .is_err());
        assert_eq!(
            cache
                .get_or_fetch("error".into(), || async { Ok(1) })
                .await
                .unwrap(),
            1
        );
        let entry = Arc::clone(cache.entries.lock().unwrap().get("error").unwrap());
        *entry.lock().await = Some((Instant::now() - Duration::from_secs(61), 1));
        assert_eq!(
            cache
                .get_or_fetch("error".into(), || async { Ok(2) })
                .await
                .unwrap(),
            2
        );
        drop(entry);
        for key in ["a", "b", "c"] {
            cache
                .get_or_fetch(key.into(), || async { Ok(3) })
                .await
                .unwrap();
        }
        assert!(cache.entries.lock().unwrap().len() <= 2);
    }
}
