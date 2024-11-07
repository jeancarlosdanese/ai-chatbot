import { S3Client, PutObjectCommand, ObjectCannedACL } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";

// Configurar o S3 Client com a AWS SDK v3
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const FileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine(
      (file) =>
        ["image/jpeg", "image/png", "application/pdf", "text/markdown"].includes(file.type),
      {
        message: "File type should be JPEG, PNG, PDF, or Markdown",
      }
    ),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const filename = file.name;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    try {
      // Enviar para o S3 usando a AWS SDK v3
      const uploadParams = {
        Bucket: process.env.S3_BUCKET_NAME, // Nome do bucket
        Key: filename, // Nome do arquivo
        Body: fileBuffer, // Conteúdo do arquivo
        ACL: ObjectCannedACL.private, // Definir permissões
      };

      const command = new PutObjectCommand(uploadParams);
      const data = await s3Client.send(command);

      return NextResponse.json({ url: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${filename}` });
    } catch (error) {
      console.log(error);
      
      return NextResponse.json({ error: "Upload to S3 failed" }, { status: 500 });
    }

    // try {
    //   const data = await put(`${filename}`, fileBuffer, {
    //     access: "public",
    //   });

    //   return NextResponse.json(data);
    // } catch (error) {
    //   return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    // }
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}
