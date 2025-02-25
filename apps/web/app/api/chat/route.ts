import { auth } from "@/auth";
import { qaWithAnthropic } from "@/utils/anthropic-integration";
import { getUserIdByEmail } from "@/utils/fetch-user";
import { qaWithGemini } from "@/utils/gemini-integration";
import { qaWithOpenAI } from "@/utils/openai-integration";
import { prisma } from "@repo/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const POST = async (request: Request) => {
  try {
    // Parse the request payload
    const { question } = await request.json();

    // Get the current session and user
    const session = await auth();

    if (session?.user) {
      if (session.user.email) {
        //storing the id of the user after fetching from database
        session.user.id = await getUserIdByEmail(session.user.email);
      }
    }

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;

    // Fetch the user's journal entries from the database
    const entries = await prisma.journalEntry.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (!entries.length) {
      return NextResponse.json({ error: "No journal entries found." }, { status: 404 });
    }

    // Get model and API key from cookies
    const cookieStore = await cookies();
    const model = cookieStore.get("model")?.value;
    const apiKey = cookieStore.get("apiKey")?.value;

    if (!model || !apiKey) {
      return NextResponse.json({ error: "Model or API key not provided in cookies." }, { status: 400 });
    }

    // Dynamically select the appropriate model
    // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
    let qaFunction;
    switch (model) {
      case "openai":
        qaFunction = qaWithOpenAI;
        break;
      case "anthropic":
        qaFunction = qaWithAnthropic;
        break;
      case "gemini":
        qaFunction = qaWithGemini;
        break;
      default:
        return NextResponse.json({ error: "Invalid model selected." }, { status: 400 });
    }

    // Call the respective `qa` function
    const answer = await qaFunction(question, entries);

    return NextResponse.json({ data: answer });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
};
