import { NextResponse } from "next/server";
import { createSignedCloudinaryUpload } from "@/lib/cloudinaryServer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const signature = createSignedCloudinaryUpload();

    return NextResponse.json({
      success: true,
      ...signature,
    });
  } catch (error) {
    console.error("Cloudinary upload signature route failed", error);

    return NextResponse.json(
      { success: false, error: "Upload setup failed." },
      { status: 500 },
    );
  }
}
