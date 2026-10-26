import { useAudioAppContext } from "../../app/AppContext";

export function TrackTableHeader() {
  const {
    colWidths,
    toggleSort,
    sortField,
    sortAsc,
    activeColResizer,
    handleColResizeStart,
    handleColResizeMove,
    handleColResizeEnd,
  } = useAudioAppContext();
  return (<thead>
    <tr>
      <th
        style={{ width: colWidths.num }}
        onClick={() => toggleSort("trackNumber")}
      >
        <span className="th-label">
          #{" "}
          {sortField === "trackNumber" &&
            (sortAsc ? "↑" : "↓")}
        </span>
        <div
          className={`col-resizer ${activeColResizer === 0 ? "active" : ""
            }`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => handleColResizeStart(0, e)}
          onPointerMove={handleColResizeMove}
          onPointerUp={handleColResizeEnd}
          onPointerCancel={handleColResizeEnd}
        />
      </th>
      <th
        style={{ width: "auto" }}
        onClick={() => toggleSort("title")}
      >
        <span className="th-label">
          제목{" "}
          {sortField === "title" && (sortAsc ? "↑" : "↓")}
        </span>
        <div
          className={`col-resizer ${activeColResizer === 1 ? "active" : ""
            }`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => handleColResizeStart(1, e)}
          onPointerMove={handleColResizeMove}
          onPointerUp={handleColResizeEnd}
          onPointerCancel={handleColResizeEnd}
        />
      </th>
      <th
        style={{ width: colWidths.artist }}
        onClick={() => toggleSort("artist")}
      >
        <span className="th-label">
          아티스트{" "}
          {sortField === "artist" && (sortAsc ? "↑" : "↓")}
        </span>
        <div
          className={`col-resizer ${activeColResizer === 2 ? "active" : ""
            }`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => handleColResizeStart(2, e)}
          onPointerMove={handleColResizeMove}
          onPointerUp={handleColResizeEnd}
          onPointerCancel={handleColResizeEnd}
        />
      </th>
      <th
        style={{ width: colWidths.album }}
        onClick={() => toggleSort("album")}
      >
        <span className="th-label">
          앨범{" "}
          {sortField === "album" && (sortAsc ? "↑" : "↓")}
        </span>
        <div
          className={`col-resizer ${activeColResizer === 3 ? "active" : ""
            }`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => handleColResizeStart(3, e)}
          onPointerMove={handleColResizeMove}
          onPointerUp={handleColResizeEnd}
          onPointerCancel={handleColResizeEnd}
        />
      </th>
      <th
        style={{ width: colWidths.year }}
        onClick={() => toggleSort("year")}
      >
        <span className="th-label">
          연도{" "}
          {sortField === "year" && (sortAsc ? "↑" : "↓")}
        </span>
        <div
          className={`col-resizer ${activeColResizer === 4 ? "active" : ""
            }`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => handleColResizeStart(4, e)}
          onPointerMove={handleColResizeMove}
          onPointerUp={handleColResizeEnd}
          onPointerCancel={handleColResizeEnd}
        />
      </th>
      <th style={{ width: colWidths.format }}>
        <span className="th-label">포맷</span>
        <div
          className={`col-resizer ${activeColResizer === 5 ? "active" : ""
            }`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => handleColResizeStart(5, e)}
          onPointerMove={handleColResizeMove}
          onPointerUp={handleColResizeEnd}
          onPointerCancel={handleColResizeEnd}
        />
      </th>
      <th
        style={{
          width: colWidths.duration,
          textAlign: "right",
        }}
        onClick={() => toggleSort("durationSecs")}
      >
        <span className="th-label">
          시간{" "}
          {sortField === "durationSecs" &&
            (sortAsc ? "↑" : "↓")}
        </span>
      </th>
      <th style={{ width: 38, textAlign: "center" }}></th>
    </tr>
  </thead>);
}
