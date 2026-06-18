import { NextRequest, NextResponse } from "next/server";
import { findDriveUploadByName } from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileName?: string;
      mimeType?: string;
      size?: number;
    };

    if (!body.fileName || !body.mimeType || !Number.isFinite(body.size)) {
      return NextResponse.json(
        { success: false, error: "Missing upload metadata." },
        { status: 400 },
      );
    }

    const file = await findDriveUploadByName({
      fileName: body.fileName,
      mimeType: body.mimeType,
      size: Number(body.size),
    });

    return NextResponse.json({
      success: true,
      found: Boolean(file),
      file,
    });
  } catch (error) {
    console.error("Google Drive upload verification route failed", error);

    return NextResponse.json(
      { success: false, error: "Upload verification failed." },
      { status: 500 },
    );
  }
}
