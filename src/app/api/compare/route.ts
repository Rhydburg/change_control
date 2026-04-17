/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file1 = formData.get("file1") as File;
    const file2 = formData.get("file2") as File;

    if (!file1 || !file2) return NextResponse.json({ error: "Missing files" }, { status: 400 });

    const urls = [];
    
    // Upload both files to Supabase Storage
    for (const file of [file1, file2]) {
      const fileName = `${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from("artworks") // REPLACE with your actual Supabase public bucket name
        .upload(fileName, file);

      if (error) {
        console.log(error);
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage.from("artworks").getPublicUrl(data.path);
      urls.push(publicUrl);
    }

    // Call OpenRouter API with the vision model (using Claude 3.5 Sonnet as an example)
//     const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
//   method: "POST",
//   headers: {
//     Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
//     "Content-Type": "application/json",
//     "HTTP-Referer": "http://localhost:3000",
//     "X-Title": "Artwork Comparator",
//   },
//   body: JSON.stringify({
//     model: "anthropic/claude-haiku-4.5", // Change this to a model that supports web browsing/file reading if needed
//     messages: [
//       {
//         role: "user",
//         content: `Please compare these two artworks/files. Here are the links:\n\nFile 1: ${urls[0]}\nFile 2: ${urls[1]}`
//       }
//     ]
//   })
// });
// const anthropicRes = await fetch('https://api.anthropic.com/v1/chat/completions', {
//   method: 'POST',
//   headers: {
//     'Content-Type': 'application/json',
//     'X-API-Key': `${process.env.ANTHROPIC_API_KEY}`,
//     'anthropic-version': '2023-06-01'
//   },
//   body: JSON.stringify({
//     model: "claude-haiku-4-5",
//     messages: [
//       {
//         role: "user",
//         content: `Please compare these two artworks/files. Here are the links:\n\nFile 1: ${urls[0]}\nFile 2: ${urls[1]}`
//       }
//     ]
//   })
// });

    // Gemini REST API
    // gemini-2.5-flash (Working)
    // gemma-3n-e2b-it (Working)
    // gemini-2.5-pro (Working)
    // gemini-2.5-flash-lite
// const geminiRes = await fetch(
//   `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
//   {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       contents: [
//         {
//           role: "user",
//           parts: [
//             {
//               text: `
// SYSTEM INSTRUCTION:
// Download files from given URLS and extract text from them and return in HTML format only. 
// Don't show any metaData. 
// Only extracted text from downloaded files in HTML form. 
// No dummy text or any text from your training data. 
// If you can't read it then say so. 
// URL1: ${urls[0]}
// URL2: ${urls[1]}
//               `,
//             },
//           ],
//         },
//       ],
//     }),
//   }
// );
// 1. Upload files first (resumable upload)
const uploadRes1 = await fetch(
  `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": file1.size.toString(),
      "X-Goog-Upload-Header-Content-Type": file1.type,
    },
    body: JSON.stringify({
      file: { displayName: `artwork1-${Date.now()}` }
    })
  }
);

// 2. Get upload URL from headers, upload bytes
const uploadUrl1 = uploadRes1.headers.get("x-goog-upload-url");
const file1Res = await fetch(uploadUrl1!, {
  method: "POST",
  headers: {
    "Content-Length": file1.size.toString(),
    "X-Goog-Upload-Offset": "0",
    "X-Goog-Upload-Command": "upload, finalize"
  },
  body: file1.stream()
});

// 3. Wait for processing (poll if needed)
const file1Data = await file1Res.json();
const file1Uri = file1Data.file.uri;

// Repeat for file2...


const uploadRes2 = await fetch(
  `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": file2.size.toString(),
      "X-Goog-Upload-Header-Content-Type": file2.type,
    },
    body: JSON.stringify({
      file: { displayName: `artwork2-${Date.now()}` }
    })
  }
);

// 2. Get upload URL from headers, upload bytes
const uploadUrl2 = uploadRes2.headers.get("x-goog-upload-url");
const file2Res = await fetch(uploadUrl2!, {
  method: "POST",
  headers: {
    "Content-Length": file2.size.toString(),
    "X-Goog-Upload-Offset": "0",
    "X-Goog-Upload-Command": "upload, finalize"
  },
  body: file2.stream()
});

// 3. Wait for processing (poll if needed)
const file2Data = await file2Res.json();
const file2Uri = file2Data.file.uri;


// 4. Use file URIs in generateContent
const geminiRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Extract data from these pharmaceutical artworks. No response from training data, no metaData. Only get data from what's inside the files in HTML format only " },
          { 
            file_data: { 
              mime_type: file1.type, 
              file_uri: file1Uri 
            } 
          },
          { 
            file_data: { 
              mime_type: file2.type, 
              file_uri: file2Uri 
            } 
          }
        ]
      }]
    })
  }
);

    console.log("Gemini API response status:", geminiRes.status);

    const aiData = await geminiRes.json();
    console.log(aiData);

    const response = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(response);
    const cleanJson =  response.replace(/```json/g, '').replace(/```/g, '');
    const cleanJson1 =  response.replace(/```html/g, '').replace(/```/g, '');
    // const comparison = JSON.parse(cleanJson);
    const comparison = cleanJson1;
    if (!comparison) throw new Error(aiData?.error?.message || "No response from Gemini");

    return NextResponse.json({ comparison, urls });

  } catch (error: any) {
    console.log(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}