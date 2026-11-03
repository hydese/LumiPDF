import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/tokens.css";
import "./styles/controls.css";

const target = document.getElementById("app");
if (!target) {
  throw new Error("LumiPDF: #app root element is missing from index.html");
}

export default mount(App, { target });
