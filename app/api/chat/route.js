import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FREE_CHAT_LIMIT = 3;

export async function POST(req) {
  try {
    const { messages, userId, currentDay, completedDays, streak } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    if (userId) {
      const { data: user, error } = await supabase
        .from("users")
        .select("is_subscribed, chat_count")
        .eq("id", userId)
        .single();

      const chatCount = user?.chat_count ?? 0;
      const isSubscribed = user?.is_subscribed ?? false;

      if (!isSubscribed && chatCount >= FREE_CHAT_LIMIT) {
        return NextResponse.json(
          { error: "FREE_LIMIT_REACHED" },
          { status: 402 }
        );
      }

      if (!isSubscribed) {
        if (user) {
          await supabase
            .from("users")
            .update({ chat_count: chatCount + 1 })
            .eq("id", userId);
        } else {
          await supabase.from("users").insert({
            id: userId,
            chat_count: 1,
            is_subscribed: false,
          });
        }
      }
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: `You are a warm, empathetic AI Life Coach for Redesign Your Life — a 100-day transformation program. Speak in natural Hinglish. User is on Day ${currentDay ?? 1}, completed ${completedDays ?? 0} days, streak: ${streak ?? 0} days. Give specific, actionable advice. Be like a wise older brother who genuinely cares.`,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text ?? "Kuch problem ho gayi. Dobara try karo 🙏";
    return NextResponse.json({ reply });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
