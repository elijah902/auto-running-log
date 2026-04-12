import { NextRequest, NextResponse } from "next/server";

interface DayData {
  dayName: string;
  activities: Array<{
    name: string;
    distance: number;
    moving_time: number;
    type: string;
    start_date: string;
  }>;
  crossTrainingMinutes: number;
}

interface GenerateNotesRequest {
  days: DayData[];
  weekMileage: number;
  weekXT: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateNotesRequest = await request.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const daysWithRuns = body.days.filter((day) => day.activities.filter((a) => a.type === "Run").length > 0);

    const daySummaries = daysWithRuns
      .map((day) => {
        const runs = day.activities
          .filter((a) => a.type === "Run")
          .map((a) => {
            const miles = (a.distance * 0.000621371).toFixed(2);
            const hours = Math.floor(a.moving_time / 3600);
            const mins = Math.floor((a.moving_time % 3600) / 60);
            const secs = a.moving_time % 60;
            const timeStr = `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
            return `${miles} miles in ${timeStr}`;
          })
          .join(", ");
        return `${day.dayName}: ${runs}`;
      })
      .join("\n");

    const prompt = `You are writing running log notes for a college runner. Write 2-3 sentences of notes for each day that had a run. Keep tone conversational and natural.

Example: "Felt pretty good. With Harding and Connor. Stomach was a little sensitive, but overall felt pretty smooth."

Format as JSON with day names as keys:
{
  "Monday": "Felt pretty good...",
  "Tuesday": "Legs were a bit tight..."
}

Training for the week:
Total Mileage: ${body.weekMileage.toFixed(1)} miles
Cross-Training: ${body.weekXT > 0 ? Math.round(body.weekXT) + " minutes" : "None"}

${daySummaries}

Write notes now in JSON format:`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You write running log notes. Keep notes conversational, 2-3 sentences per day. Return ONLY valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";

    let notes: Record<string, string> = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        notes = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error("Failed to parse AI response");
    }

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Notes generation error:", error);
    return NextResponse.json({ error: "Failed to generate notes" }, { status: 500 });
  }
}
