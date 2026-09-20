import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#131315",
        }}
      >
        <span
          style={{
            fontSize: 84,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#ffd56d",
          }}
        >
          {"S&S"}
        </span>
      </div>
    ),
    { width: 192, height: 192 },
  );
}
