import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 웹뷰 기본 메뉴만 막고 앱의 우클릭 이벤트는 그대로 전달합니다.
document.addEventListener("contextmenu", event => event.preventDefault(), { capture: true });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
