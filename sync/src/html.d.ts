// Wrangler bundles *.html imports as text (its default module rules).
declare module '*.html' {
  const content: string;
  export default content;
}
