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
const geminiRes = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemma-3n-e2b-it:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
SYSTEM INSTRUCTION:
You are a pharmaceutical regulatory expert for artwork Change Control documentation.
 
You will receive ONE or TWO Public URLS of Artwork Files (images or PDFs of pharmaceutical artworks/labels):
- File 1: Previous/Current artwork
- File 2: New/Revised artwork (if provided)
 
Analyze and compare them. Return ONLY valid JSON — no markdown, no backticks, no explanation outside JSON.
 
{
  "currentState": "Detailed paragraph describing the CURRENT/PREVIOUS artwork — what was missing, incorrect, or absent.",
  "newSuggestedState": "Detailed paragraph describing the NEW/REVISED artwork — what was added, corrected, or updated.",
  "scientificRationale": "Paragraph explaining the regulatory/quality scientific rationale for these changes."
}
 
Be specific, precise, and use professional pharmaceutical regulatory language.
USER TASK:
Download and Compare these two pharmaceutical artworks:
Previous: ${urls[0]}
New: ${urls[1]}
              `,
            },
          ],
        },
      ],
    }),
  }
);

    console.log("Gemini API response status:", geminiRes.status);

    const aiData = await geminiRes.json();
    console.log(aiData);

    const response = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleanJson =  response.replace(/```json/g, '').replace(/```/g, '');
    // const comparison = JSON.parse(cleanJson);
    const comparison = cleanJson;
    if (!comparison) throw new Error(aiData?.error?.message || "No response from Gemini");

    return NextResponse.json({ comparison, urls });

  } catch (error: any) {
    console.log(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}