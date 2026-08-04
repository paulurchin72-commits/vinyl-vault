import { useEffect, useState } from "react";
import Papa from "papaparse";

function App() {
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Papa.parse("/Pault99-collection-20260803-1505.csv", {
      download: true,
      header: true,
      complete: (results) => {
        setRecords(results.data.filter(r => r.Artist && r.Title));
      },
    });
  }, []);

  const filteredRecords = records.filter((record) =>
    `${record.Artist} ${record.Title}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

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

      <input
        type="text"
        placeholder="🔍 Search your collection..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          maxWidth: "500px",
          padding: "12px",
          marginTop: "20px",
          marginBottom: "20px",
          borderRadius: "10px",
          border: "1px solid #444",
          background: "#222",
          color: "white",
          fontSize: "16px",
        }}
      />

      <h2>
        {filteredRecords.length} of {records.length} Records
      </h2>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {filteredRecords.map((record, index) => (
          <li
            key={index}
            style={{
              background: "#1b1b1b",
              marginBottom: "12px",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid #333",
            }}
          >
            <h3 style={{ margin: 0 }}>{record.Artist}</h3>

            <p style={{ margin: "8px 0", color: "#ccc" }}>
              {record.Title}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;