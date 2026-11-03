import { readFile, writeFile, mkdir } from "node:fs/promises";
let html = await readFile("dist/index.html", "utf8");
const script = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/);
if (!script || !style)
  throw new Error(
    "Expected a single script and stylesheet for the offline gallery.",
  );
const js = await readFile("dist/" + script[1].replace(/^\.\//, ""), "utf8");
const css = await readFile("dist/" + style[1].replace(/^\.\//, ""), "utf8");
html = html.replace(
  script[0],
  () =>
    '<script type="module">' +
    js.replaceAll("</script", "<\\/script") +
    "</script>",
);
html = html.replace(style[0], () => "<style>" + css + "</style>");
await mkdir("previews", { recursive: true });
await writeFile("previews/design-gallery.html", html);
console.log(
  "Exported a self-contained gallery. No server or API key required.",
);
