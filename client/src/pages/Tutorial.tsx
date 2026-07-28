import { trpc } from "@/lib/trpc";

export default function Tutorial() {
  const { data, isLoading } = trpc.video.getTutorialUrl.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 8,
  });

  return (
    <div style={{
      margin: 0,
      padding: 0,
      background: "#000",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {isLoading ? (
        <p style={{ color: "#fff", fontSize: 16 }}>Carregando...</p>
      ) : data?.url ? (
        <video
          src={data.url}
          controls
          playsInline
          autoPlay={false}
          controlsList="nodownload"
          style={{
            width: "100%",
            maxWidth: 480,
            height: "auto",
            display: "block",
          }}
        />
      ) : (
        <p style={{ color: "red", fontSize: 16 }}>Erro ao carregar vídeo.</p>
      )}
    </div>
  );
}
