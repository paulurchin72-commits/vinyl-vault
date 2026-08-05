import { useEffect, useState } from "react";
import { getRelease } from "../services/discogs";

function AlbumCard({ record }) {
  const [cover, setCover] = useState(null);

  useEffect(() => {
    async function loadArtwork() {
    if (!record.release_id) return;



      try {
        const album = await getRelease(record.release_id);
        console.log("Release ID:", record.release_id);


        if (album.thumb) {
          setCover(album.thumb);
        }
      } catch (err) {
        console.log(err);
      }
    }

    loadArtwork();
  }, [record.release_id]);

  return (
  
      <li
  onClick={() => alert(JSON.stringify(record, null, 2))}
  style={{
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "18px",
        padding: "18px",
        marginBottom: "16px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        display: "flex",
        gap: "20px",
        alignItems: "center",
        cursor: "pointer",
transition: "transform 0.2s ease",
      }}
    >
      <div
        style={{
          width: "90px",
          height: "90px",
          flexShrink: 0,
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt={record.Title}
            style={{
              width: "90px",
              height: "90px",
              objectFit: "cover",
              borderRadius: "12px",
            }}
          />
        ) : (
          <div
            style={{
              width: "90px",
              height: "90px",
              background: "#222",
              borderRadius: "12px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              color: "#888",
            }}
          >
            💿
          </div>
        )}
      </div>

      <div>
        <h3 style={{ margin: 0 }}>{record.Artist}</h3>

        <p style={{ margin: "6px 0", color: "#ddd" }}>
          {record.Title}
        </p>

        <p style={{ color: "#999", margin: 0 }}>
          {record.Released}
        </p>
      </div>
    </li>
  );
}

export default AlbumCard;