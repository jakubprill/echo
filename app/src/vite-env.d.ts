/// <reference types="vite/client" />
declare const __ECHO_TARGET__: "app" | "artifact";
declare module "virtual:echo-content" {
  export const decks: unknown[];
  export const books: unknown[];
}
