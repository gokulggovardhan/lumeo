import { NextResponse } from "next/server";
import { createSignedCloudinaryUpload } from "@/lib/cloudinaryServer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const signature = createSignedCloudinaryUpload();

    console.info("[Lumeo Upload] signed upload prepared", {
      stage: "signature",
    });

    return NextResponse.json({
      success: true,
      ...signature,
    });
  } catch (error) {
    console.error("Cloudinary upload signature route failed", {
      stage: "signature",
      error,
    });

    return NextResponse.json(
      {
        success: false,
        error: "Upload could not start. Please retry.",
        failedStage: "signature",
        details: getSafeErrorMessage(error),
      },
      { status: 500 },
    );
  }
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 180) : "Unknown error.";
}
