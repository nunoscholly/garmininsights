// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { env } from "@/lib/env";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/api/py/(.*)", "/api/ingest/sync(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const { userId, sessionClaims } = await auth();
  if (!userId) return (await auth()).redirectToSignIn();
  const email = (sessionClaims as { email?: string })?.email;
  if (email !== env.ALLOWED_EMAIL) {
    return Response.redirect(new URL("/forbidden", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
