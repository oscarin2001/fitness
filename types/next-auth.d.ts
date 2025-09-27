// Minimal module declarations to silence missing type errors if TS fails to pick up types from next-auth package.
declare module "next-auth" {
  import type { NextApiRequest, NextApiResponse } from "next";
  const NextAuth: any;
  export default NextAuth;
}

declare module "next-auth/providers/google" {
  const GoogleProvider: any;
  export default GoogleProvider;
}