import { useEffect, useState } from "react";
import Papa from "papaparse";
import { getRelease } from "./services/discogs";
import AlbumCard from "./components/AlbumCard";
function App() {
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    Papa.parse("/Pault99-collection-20260803-1505.csv", {
      download: true,
      header: true,
      complete: (results) => {
        setRecords(results.data.filter((r) => r.Artist && r.Title));
      },
    });
  }, []);

  const filteredRecords = records.filter((record) =>
    `${record.Artist} ${record.Title}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  async function testDiscogs() {
    try {
      const album = await getRelease(249504);
      setMessage(`✅ Connected! Album: ${album.title}`);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    }
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0d0d0d 0%, #1a1a1a 100%)",
        backgroundAttachment: "fixed",
        color: "white",
        minHeight: "100vh",
        padding: "50px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: "48px",
          marginBottom: "10px",
          color: "#f5c542",
          textShadow: "0 0 20px rgba(245,197,66,0.4)",
        }}
      >
        📦 The Memory Box
      </h1>

      <p style={{ color: "#bbb", marginBottom: "30px" }}>
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
          marginBottom: "20px",
          borderRadius: "10px",
          border: "1px solid #444",
          background: "#222",
          color: "white",
          fontSize: "16px",
          boxShadow: "0 0 20px rgba(245,197,66,0.15)",
        }}
      />

      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={testDiscogs}
          style={{
            padding: "10px 18px",
            borderRadius: "8px",
            border: "none",
            background: "#f5c542",
            color: "#111",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Test Discogs
        </button>
      </div>

      {message && (
        <p style={{ color: "#f5c542", marginBottom: "20px" }}>{message}</p>
      )}

      <h2 style={{ marginBottom: "25px" }}>
        {filteredRecords.length} of {records.length} Records
      </h2>

    
     <ul style={{ listStyle: "none", padding: 0 }}>
  {filteredRecords.map((record, index) => (
    <AlbumCard
      key={index}
      record={record}
    />
  ))}
</ul>
      
    </div>
  );
}

export default App;