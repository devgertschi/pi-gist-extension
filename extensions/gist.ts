import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function extractLastAssistantText(sessionManager: any): string | undefined {
	const messages = sessionManager.buildSessionContext()?.messages ?? [];
	const lastAssistant = messages
		.slice()
		.reverse()
		.find((message: any) => {
			if (message?.role !== "assistant") return false;
			if (message.stopReason === "aborted" && Array.isArray(message.content) && message.content.length === 0) {
				return false;
			}
			return true;
		});

	if (!lastAssistant || !Array.isArray(lastAssistant.content)) return undefined;

	const text = lastAssistant.content
		.filter((block: any) => block?.type === "text" && typeof block.text === "string")
		.map((block: any) => block.text)
		.join("")
		.trim();

	return text || undefined;
}

function tryClipboardCommand(command: string, args: string[], input: string): boolean {
	try {
		execFileSync(command, args, {
			input,
			stdio: ["pipe", "ignore", "ignore"],
			timeout: 5000,
		});
		return true;
	} catch {
		return false;
	}
}

function copyToClipboard(text: string): void {
	const encoded = Buffer.from(text).toString("base64");
	process.stdout.write(`\x1b]52;c;${encoded}\x07`);

	if (process.platform === "darwin") {
		tryClipboardCommand("pbcopy", [], text);
		return;
	}

	if (process.platform === "win32") {
		tryClipboardCommand("clip", [], text);
		return;
	}

	if (process.env.TERMUX_VERSION && tryClipboardCommand("termux-clipboard-set", [], text)) {
		return;
	}

	if (process.env.WAYLAND_DISPLAY && tryClipboardCommand("wl-copy", [], text)) {
		return;
	}

	if (process.env.DISPLAY) {
		if (tryClipboardCommand("xclip", ["-selection", "clipboard"], text)) return;
		tryClipboardCommand("xsel", ["--clipboard", "--input"], text);
	}
}

function formatDateFilename(date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `pi-gist-${year}${month}${day}-${hours}${minutes}.md`;
}

export default function gistExtension(pi: ExtensionAPI) {
	pi.registerCommand("gist", {
		description: "Create a secret GitHub gist from the last assistant message and copy its URL",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.setStatus("gist", "Waiting for current response to finish...");
				await ctx.waitForIdle();
			}

			const text = extractLastAssistantText(ctx.sessionManager);
			if (!text) {
				ctx.ui.setStatus("gist", undefined);
				ctx.ui.notify("No assistant message with text to gist yet.", "error");
				return;
			}

			try {
				const auth = await pi.exec("gh", ["auth", "status"], { timeout: 5000 });
				if (auth.code !== 0) {
					ctx.ui.setStatus("gist", undefined);
					ctx.ui.notify("GitHub CLI is not logged in. Run 'gh auth login' first.", "error");
					return;
				}
			} catch {
				ctx.ui.setStatus("gist", undefined);
				ctx.ui.notify("GitHub CLI (gh) is not installed. Install it from https://cli.github.com/", "error");
				return;
			}

			const tmpFile = join(tmpdir(), formatDateFilename());
			ctx.ui.setStatus("gist", "Creating gist...");

			try {
				writeFileSync(tmpFile, text, "utf-8");

				const result = await pi.exec(
					"gh",
					["gist", "create", "--public=false", "--desc", "pi /gist last assistant message", tmpFile],
					{ timeout: 60000 },
				);

				if (result.code !== 0) {
					const error = (result.stderr || result.stdout || "Unknown error").trim();
					ctx.ui.notify(`Failed to create gist: ${error}`, "error");
					return;
				}

				const gistUrl = `${result.stdout}\n${result.stderr}`
					.split(/\r?\n/)
					.map((line) => line.trim())
					.find((line) => line.startsWith("https://"));

				if (!gistUrl) {
					ctx.ui.notify("Failed to read gist URL from gh output.", "error");
					return;
				}

				copyToClipboard(gistUrl);
				ctx.ui.notify(`Gist URL copied to clipboard\n${gistUrl}`, "info");
			} finally {
				ctx.ui.setStatus("gist", undefined);
				try {
					unlinkSync(tmpFile);
				} catch {
					// Ignore temp file cleanup errors.
				}
			}
		},
	});
}
