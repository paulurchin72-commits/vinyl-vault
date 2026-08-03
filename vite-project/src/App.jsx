import { useEffect, useState } from "react";
import Papa from "papaparse";

function App() {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    Papa.parse("/Pault99-collection-20260803-1505.csv", {
      download: true,
      header: true,
      complete: (results) => {
        setRecords(results.data.filter(r => r.Artist && r.Title));
      },
    });
  }, []);

  return (
    <div
      style={{
        background: "#111",
        color: "white",
        minHeight: "100vh",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>📦 The Memory Box</h1>

      <p style={{ color: "#bbb" }}>
        Every record has a story.
      </p>

      <h2>{records.length} Records Loaded</h2>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {records.map((record, index) => (
          
          <li
            key={index}
            style={{
              padding: "12px",
              borderBottom: "1px solid #333",
            }}
          >
            <strong>{record.Artist}</strong>
            <br />
            {record.Title}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;