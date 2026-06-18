import { NextResponse } from "next/server";
import {
  getDriveFolderMetadata,
  getGoogleDriveEnv,
} from "@/lib/googleDriveServer";

export async function GET() {
  try {
    const env = getGoogleDriveEnv();
    const folder = await getDriveFolderMetadata(env.uploadsFolderId);

    return NextResponse.json(
      {
        connected: true,
        folderName: folder.name,
        folderId: folder.id,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Google Drive status check failed", error);

    return NextResponse.json(
      {
        connected: false,
        folderName: null,
        folderId: null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
