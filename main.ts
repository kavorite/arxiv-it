import {
	App,
	// Editor,
	// MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import wordWrap from "word-wrap";

// import Search from "./Search.svelte";

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "arxiv",
			name: "ArXiv paper",
			callback: () => {
				new SearchModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: "sample-editor-command",
		// 	name: "Sample editor command",
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection("Sample Editor Command");
		// 	},
		// });
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: "open-sample-modal-complex",
		// 	name: "Open sample modal (complex)",
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView =
		// 			this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SearchModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	},
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		// this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, "click", (evt: MouseEvent) => {
		// 	console.log("click", evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(
		// 	window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		// );
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

interface IReflowOptions {
	width: number;
	indent: string;
}

function reflow(text: string, opts: IReflowOptions | undefined): string {
	text = text.replace(/\s+/, " ");
	opts = opts || { width: 80, indent: "" };
	// Adjust the line length to account for the prefix
	const { width, indent } = opts;
	const adjustedLineLength = width - indent.length;
	// Regex to match up to `adjustedLineLength` characters followed by a word boundary
	const regex = new RegExp(`(.{1,${adjustedLineLength}})(\\s|\b|$)`, "g");
	// const lines = [...text.matchAll(regex)]
	// console.log(lines);
	// return lines.map(line => prefix + line[0].trim()).join("\n");
	// Split the text using the regex and apply the prefix to each line
	return text.replace(regex, (match, p1) => indent + p1.trim() + "\n").trim();
}

// eslint-disable-next-line @typescript-eslint/ban-types
function debounce(f: Function, timeout = 250) {
	let timer: NodeJS.Timeout | undefined = undefined;
	return (...args: any[]) => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			f(...args);
		}, timeout);
	};
}

class SearchModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	extractMeta(feed: Document) {
		const entry = feed.querySelector("feed entry");
		if (entry == null) {
			return null;
		} else {
			const title = entry
				?.querySelector("title")
				?.textContent?.trim()
				.replace(/\s+|$/g, " ")
				.replace(/:\s+/g, " - ")
				.trim();
			let abstract = entry?.querySelector("summary")?.textContent?.trim();
			abstract = wordWrap(abstract || "", {
				width: 80,
				indent: "> ",
			});
			const authors: string[] = [];
			entry?.querySelectorAll("author name")?.forEach((elem) => {
				if (elem.textContent) {
					authors.push(elem.textContent.trim());
				}
			});
			const year = new Date(
				entry?.querySelector("updated")?.textContent || ""
			).getFullYear();
			return { title, year, authors, abstract };
		}
	}

	fetchMeta(url: string) {
		const aid = url.slice(url.lastIndexOf("/") + 1);
		if (aid === url) {
			url = `https://arxiv.org/abs/${aid}`;
		}
		return fetch(`https://export.arxiv.org/api/query?id_list=${aid}`)
			.then((rsp) => {
				if (rsp.status != 200) {
					throw new Error(rsp.statusText);
				} else {
					return rsp.text();
				}
			})
			.then((xml) => {
				const parser = new DOMParser();
				return parser.parseFromString(xml, "application/xml");
			})
			.then(this.extractMeta)
			.then((meta) => {
				if (!meta) {
					throw new Error("ArXiv returned invalid RSS feed");
				} else {
					return meta;
				}
			});
	}

	createStub(url: string) {
		const aid = url.slice(url.lastIndexOf("/") + 1);
		if (aid === url) {
			url = `https://arxiv.org/abs/${aid}`;
		}

		this.fetchMeta(url)
			.then(({ title, year, authors, abstract }) => {
				const author = `**Author${
					authors.length > 1 ? "s" : ""
				}:** *${authors.join(", ")}*`;
				const surnames = authors.map((name) =>
					name.slice(name.lastIndexOf(" ") + 1)
				);
				const citation =
					authors.length < 3
						? `${surnames.join(" and ")} (${year})`
						: `${surnames[0]}, et al. (${year})`;
				const content = `# ${title}\n## ${citation}\n## [ArXiv:${aid}](${url})\n${abstract}\n\n${author}\n#paper #stub\n# Discussion`;
				return { title, content };
			})
			.then(({ title, content }) => {
				return this.app.vault
					.create(`${title}.md`, content)
					.then(() => ({ title, content }));
			})
			.then(({ title }) => {
				const { workspace } = this.app;
				if (workspace.activeEditor?.editor) {
					const { editor } = workspace.activeEditor;
					editor.replaceSelection(`[[${title}]]`);
				}
			})
			.then(() => this.close())
			.catch((err) => new Notice(`ArXiv It: import error: ${err}`));
	}

	onOpen() {
		const { contentEl } = this;
		const urlInput = contentEl.createEl("input", {
			attr: {
				placeholder: "https://arxiv.org/abs/...",
				style: "width: 75%",
			},
		});
		const search = contentEl.createEl("input", {
			attr: { placeholder: "Search ArXiv...", style: "width: 75%" },
		});
		const results = contentEl.createEl("ol");
		search.addEventListener(
			"keydown",
			debounce(async (_: KeyboardEvent) => {
				const parser = new DOMParser();
				const endpoint = "https://export.arxiv.org/api/query";
				const rsp = await fetch(
					`${endpoint}?search_query=all:${search.value}`
				);
				const dom = parser.parseFromString(
					await rsp.text(),
					"application/xml"
				);
				results.innerHTML = "";
				dom.querySelectorAll("feed entry").forEach((entry) => {
					const { textContent: title } =
						entry.querySelector("title")!;
					const url = entry
						.querySelector("link")!
						.getAttribute("href")!
						.replace(/v[0-9]+$/, "");
					const li = contentEl.createEl("li");
					const link = li.createEl("a", { attr: { href: "#0" } });
					link.textContent = title!.trim();
					link.addEventListener("click", (_: MouseEvent) => {
						this.createStub(url);
					});
					results.appendChild(li);
				});
			})
		);

		// const button = contentEl.createEl("button", { attr: { label: "Import" }});
		contentEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				const url = urlInput.value.trim().toLowerCase();
				this.createStub(url);
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
