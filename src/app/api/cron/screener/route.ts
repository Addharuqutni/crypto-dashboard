import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.info("[Cron] Memulai screener cycle via worker script...");
    
    // Call existing worker script (single run)
    // Resolving from project root
    const scriptPath = path.join(process.cwd(), "scripts/screener/start.ts");
    const tsxPath = path.join(process.cwd(), "node_modules/.bin/tsx");
    
    const { stdout, stderr } = await execAsync(`"${tsxPath}" "${scriptPath}" --once`);

    console.info("[Cron] Screener cycle stdout:", stdout);
    if (stderr) console.error("[Cron] Screener cycle stderr:", stderr);

    return NextResponse.json({
      success: true,
      message: "Screener cycle executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Gagal menjalankan screener:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
