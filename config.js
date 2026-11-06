/* Deployment knobs for the landing page. Edit this file on the host, nothing else.
   api: the verifier service (waitlist endpoint). app: the console. x: the X / Twitter
   handle, without the @ (empty = no link shown). */
(function () {
  var h = location.hostname;
  var local = h === "localhost" || h === "127.0.0.1";
  // GitHub Pages serves the site under /keyed-web/ and the console under /keyed-web/app/.
  var pages = /github\.io$/.test(h);
  window.KEYS_CONFIG = {
    api: local ? "http://localhost:8797" : pages ? "https://keyed-verifier.fly.dev" : "/api",
    app: local ? "http://localhost:5173" : pages ? "/keyed-web/app/" : "/app/",
    x: "",
  };
})();
