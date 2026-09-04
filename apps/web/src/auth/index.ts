import NextAuth from "next-auth";
import { authConfig } from "./config.js";

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
export { useSecureCookies } from "./config.js";
