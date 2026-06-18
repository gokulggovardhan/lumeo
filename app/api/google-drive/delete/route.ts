import { NextRequest, NextResponse } from "next/server";
import { deleteDriveFile } from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileId?: string;
    };

    if (!body.fileId) {
      return NextResponse.json(
        { success: false, error: "Missing file ID." },
        { status: 400 },
      );
    }

    await deleteDriveFile(body.fileId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Google Drive delete route failed", error);

    return NextResponse.json(
      { success: false, error: "Delete failed." },
      { status: 500 },
    );
  }
}
