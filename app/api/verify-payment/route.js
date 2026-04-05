import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function POST(req) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    if (!razorpayKeySecret) {
      console.error("Missing Razorpay key secret");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Validate Supabase URL format
    try {
      new URL(supabaseUrl);
    } catch {
      console.error("Invalid Supabase URL format");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { payment_id, order_id, signature, userId } = await req.json();

    if (!payment_id || !order_id || !signature || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify payment signature
    const expectedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(order_id + "|" + payment_id)
      .digest("hex");

    if (expectedSignature !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Update user subscription
    const { error } = await supabase
      .from("users")
      .update({ is_subscribed: true })
      .eq("id", userId);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
