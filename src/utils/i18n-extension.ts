import { setTranslations } from "@mariozechner/mini-lit";
import { translations as webUiTranslations } from "../web-ui/index.js";

declare module "@mariozechner/mini-lit" {
	interface i18nMessages {
		// Web-UI base keys (needed for type safety)
		"Delete this session?": string;
		Today: string;
		Yesterday: string;
		"{days} days ago": string;
		Sessions: string;
		"Load a previous conversation": string;
		"No sessions yet": string;
		messages: string;
		Delete: string;
		"Loading...": string;

		// Sitegeist extension keys
		"Permission request failed": string;
		"JavaScript Execution Permission Required": string;
		"This extension needs permission to execute JavaScript code on web pages": string;
		"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.": string;
		"The AI can read and modify web page content when you ask it to": string;
		"Code runs in an isolated environment with security safeguards": string;
		"Network access is blocked to prevent data exfiltration": string;
		"You can revoke this permission at any time in browser settings": string;
		"Writing JavaScript code...": string;
		"Execute JavaScript": string;
		"Preparing JavaScript...": string;
		"Getting skill": string;
		"Got skill": string;
		"Listing skills": string;
		"Creating skill": string;
		"Created skill": string;
		"Updating skill": string;
		"Updated skill": string;
		"Rewriting skill": string;
		"Rewritten skill": string;
		"Deleting skill": string;
		"Processing skill...": string;
		"No skills found": string;
		"Skills for domain": string;
		"Deleted skill": string;
		Examples: string;
		Library: string;
		"Command failed:": string;
		"Why is this needed?": string;
		"What this means:": string;
		"Continue Anyway": string;
		"Requesting...": string;
		"Grant Permission": string;
		"Navigating to": string;
		"Click to open": string;
		"Waiting...": string;
		Current: string;
		Locked: string;
		"Export failed. Check console for details.": string;
		"Invalid import file format": string;
		"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.": string;
		"Imported {imported} sessions, skipped {skipped} duplicates": string;
		"Imported {count} sessions": string;
		"Import failed. Check console for details.": string;
		Import: string;
		"Export All": string;
		Export: string;
		"No sessions older than {days} days": string;
		"Delete {count} sessions older than {days} days?": string;
		"Failed to delete sessions. Check console for details.": string;
		"Delete Old": string;
		"All sessions": string;
		"No sessions to delete": string;
		"Delete ALL {count} sessions? This cannot be undone!": string;
		"Older than 7 days": string;
		"Older than 30 days": string;
		"Older than 90 days": string;
		"Search sessions...": string;
		"Total: {count} sessions · {messages} messages · ${cost}": string;
		"Open tabs": string;
		"Waiting for selection": string;
		"Preparing element selector...": string;
		About: string;
		"AI-powered browser extension for web navigation and interaction": string;
		"Version:": string;
		Website: string;
		Imprint: string;
		Privacy: string;
		"Checking for updates...": string;
		"Update Available": string;
		"A new version ({version}) is available": string;
		Update: string;
		"You're up to date": string;
		"Update Required": string;
		"A new version ({version}) is available. Please update to continue.": string;
		"Update Now": string;
		// API Keys & OAuth tab
		"API Keys & OAuth": string;
		Connected: string;
		"Enter code:": string;
		"Logging in...": string;
		"Not connected": string;
		Logout: string;
		Login: string;
		"Login failed": string;
		"Subscription Login": string;
		"Log in with your existing subscription. No API key needed. Tokens are stored locally and refreshed automatically.": string;
		"Enter API keys for cloud providers. Keys are stored locally in your browser.": string;

		// Welcome Setup Dialog
		"Welcome to Sitegeist": string;
		"To get started, you need to connect at least one AI provider. You can either log in with an existing subscription (Anthropic, OpenAI, or GitHub Copilot) or enter an API key.": string;
		"Set up provider": string;

		// Skills Tab
		'Delete skill "{name}"?': string;
		"Invalid skills file: expected an array of skills": string;
		"Failed to import skills:": string;
		"Imported {count} skill(s)": string;
		"Domain Patterns (comma-separated)": string;
		"Short Description": string;
		"Description (Markdown)": string;
		"Examples (JavaScript)": string;
		"Library Code": string;
		"Import Conflicts": string;
		"The following skills already exist. Check the skills you want to overwrite:": string;
		"Import Selected": string;
		"Manage site skills - reusable JavaScript libraries for domain-specific automation.": string;
		"Export Skills": string;
		"Import Skills": string;
		"Search skills by name, domain, or description...": string;
		"No skills match your search": string;
		"No skills created yet": string;
		"Name (cannot be changed)": string;
		"Edit Skill:": string;
		Skills: string;
		// Scheduled Tasks Tab
		"Scheduled Tasks": string;
		"New Task": string;
		"Edit Task": string;
		"Delete Task": string;
		'Delete task "{name}"?': string;
		"No scheduled tasks yet": string;
		"Create a scheduled task to automate web operations": string;
		"Task Name": string;
		Description: string;
		"Target URL": string;
		Schedule: string;
		"Run Once": string;
		Interval: string;
		Cron: string;
		"Execution Mode": string;
		Silent: string;
		Visible: string;
		"Silent mode runs the task in a background tab": string;
		"Visible mode runs the task in a foreground tab": string;
		"At:": string;
		"Every (minutes):": string;
		"Cron Expression:": string;
		"Cron Presets": string;
		"Every hour": string;
		"Every day at 9:00": string;
		"Every Monday at 9:00": string;
		"Every 1st of month at 9:00": string;
		"Prompt Template": string;
		"Advanced: override the default prompt template for this task.": string;
		Enabled: string;
		Disabled: string;
		"Last run": string;
		"Next run": string;
		History: string;
		Success: string;
		Failed: string;
		Timeout: string;
		Running: string;
		"Never run": string;
		"Execution History": string;
		"No execution history": string;
		"Total runs": string;
		Duration: string;
		"Open Session": string;
		"Task created": string;
		"Task updated": string;
		"Task deleted": string;
		"Invalid cron expression": string;
		"Please enter a task name": string;
		"Please select a schedule time": string;
		"Please enter an interval in minutes": string;
		"Please enter a cron expression": string;
		"Save Task": string;
		Cancel: string;
		Enable: string;
		Disable: string;
		Edit: string;
		"Task Name (required)": string;
		"Description (optional)": string;
		"Target URL (optional, opens in task tab)": string;
		"Create your first task to get started": string;
		"Manage scheduled tasks for automated web operations.": string;
		"Minimum interval is 1 minute": string;
		"Once tasks are automatically disabled after execution": string;
		"Use natural language to describe what the task should do": string;
		"Task will run at the specified time": string;
		"Task will repeat at the specified interval": string;
		"Task will follow the cron schedule": string;
		Model: string;
		"Default (last used)": string;
		Select: string;
		Reset: string;
		"Reset to default": string;
		"Choose which AI model to use for this task. Default uses the last selected model.": string;
	}
}

const sitegeistTranslations = {
	en: {
		"Permission request failed": "Permission request failed",
		"JavaScript Execution Permission Required": "JavaScript Execution Permission Required",
		"This extension needs permission to execute JavaScript code on web pages":
			"This extension needs permission to execute JavaScript code on web pages",
		"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.":
			"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.",
		"The AI can read and modify web page content when you ask it to":
			"The AI can read and modify web page content when you ask it to",
		"Code runs in an isolated environment with security safeguards":
			"Code runs in an isolated environment with security safeguards",
		"Network access is blocked to prevent data exfiltration":
			"Network access is blocked to prevent data exfiltration",
		"You can revoke this permission at any time in browser settings":
			"You can revoke this permission at any time in browser settings",
		"Writing JavaScript code...": "Writing JavaScript code...",
		"Execute JavaScript": "Execute JavaScript",
		"Preparing JavaScript...": "Preparing JavaScript...",
		"Getting skill": "Getting skill",
		"Got skill": "Got skill",
		"Listing skills": "Listing skills",
		"Creating skill": "Creating skill",
		"Created skill": "Created skill",
		"Updating skill": "Updating skill",
		"Updated skill": "Updated skill",
		"Rewriting skill": "Rewriting skill",
		"Rewritten skill": "Patched skill",
		"Deleting skill": "Deleting skill",
		"Processing skill...": "Processing skill...",
		"No skills found": "No skills found",
		"Skills for domain": "Skills for domain",
		"Deleted skill": "Deleted skill",
		Examples: "Examples",
		Library: "Library",
		"Command failed:": "Command failed:",
		"Why is this needed?": "Why is this needed?",
		"What this means:": "What this means:",
		"Continue Anyway": "Continue Anyway",
		"Requesting...": "Requesting...",
		"Grant Permission": "Grant Permission",
		"Navigating to": "Navigating to",
		"Click to open": "Click to open",
		"Waiting...": "Waiting...",
		Current: "Current",
		Locked: "Locked",
		"Export failed. Check console for details.": "Export failed. Check console for details.",
		"Invalid import file format": "Invalid import file format",
		"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.":
			"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.",
		"Imported {imported} sessions, skipped {skipped} duplicates":
			"Imported {imported} sessions, skipped {skipped} duplicates",
		"Imported {count} sessions": "Imported {count} sessions",
		"Import failed. Check console for details.": "Import failed. Check console for details.",
		Import: "Import",
		"Export All": "Export All",
		Export: "Export",
		"No sessions older than {days} days": "No sessions older than {days} days",
		"Delete {count} sessions older than {days} days?": "Delete {count} sessions older than {days} days?",
		"Failed to delete sessions. Check console for details.": "Failed to delete sessions. Check console for details.",
		"Delete Old": "Delete",
		"All sessions": "All sessions",
		"No sessions to delete": "No sessions to delete",
		"Delete ALL {count} sessions? This cannot be undone!": "Delete ALL {count} sessions? This cannot be undone!",
		"Older than 7 days": "Older than 7 days",
		"Older than 30 days": "Older than 30 days",
		"Older than 90 days": "Older than 90 days",
		"Search sessions...": "Search sessions...",
		"Total: {count} sessions · {messages} messages · ${cost}":
			"Total: {count} sessions · {messages} messages · ${cost}",
		"Open tabs": "Open tabs",
		"Waiting for selection": "Waiting for selection",
		"Preparing element selector...": "Preparing element selector...",
		About: "About",
		"AI-powered browser extension for web navigation and interaction":
			"AI-powered browser extension for web navigation and interaction",
		"Version:": "Version:",
		Website: "Website",
		Imprint: "Imprint",
		Privacy: "Privacy",
		"Checking for updates...": "Checking for updates...",
		"Update Available": "Update Available",
		"A new version ({version}) is available": "A new version ({version}) is available",
		Update: "Update",
		"You're up to date": "You're up to date",
		"Update Required": "Update Required",
		"A new version ({version}) is available. Please update to continue.":
			"A new version ({version}) is available. Please update to continue.",
		"Update Now": "Update Now",
		// API Keys & OAuth tab
		"API Keys & OAuth": "API Keys & OAuth",
		Connected: "Connected",
		"Enter code:": "Enter code:",
		"Logging in...": "Logging in...",
		"Not connected": "Not connected",
		Logout: "Logout",
		Login: "Login",
		"Login failed": "Login failed",
		"Subscription Login": "Subscription Login",
		"Log in with your existing subscription. No API key needed. Tokens are stored locally and refreshed automatically.":
			"Log in with your existing subscription. No API key needed. Tokens are stored locally and refreshed automatically.",
		"Enter API keys for cloud providers. Keys are stored locally in your browser.":
			"Enter API keys for cloud providers. Keys are stored locally in your browser.",
		// Welcome Setup Dialog
		"Welcome to Sitegeist": "Welcome to Sitegeist",
		"To get started, you need to connect at least one AI provider. You can either log in with an existing subscription (Anthropic, OpenAI, or GitHub Copilot) or enter an API key.":
			"To get started, you need to connect at least one AI provider. You can either log in with an existing subscription (Anthropic, OpenAI, or GitHub Copilot) or enter an API key.",
		"Set up provider": "Set up provider",
		// Skills Tab
		'Delete skill "{name}"?': 'Delete skill "{name}"?',
		"Invalid skills file: expected an array of skills": "Invalid skills file: expected an array of skills",
		"Failed to import skills:": "Failed to import skills:",
		"Imported {count} skill(s)": "Imported {count} skill(s)",
		"Domain Patterns (comma-separated)": "Domain Patterns (comma-separated)",
		"Short Description": "Short Description",
		"Description (Markdown)": "Description (Markdown)",
		"Examples (JavaScript)": "Examples (JavaScript)",
		"Library Code": "Library Code",
		"Import Conflicts": "Import Conflicts",
		"The following skills already exist. Check the skills you want to overwrite:":
			"The following skills already exist. Check the skills you want to overwrite:",
		"Import Selected": "Import Selected",
		"Manage site skills - reusable JavaScript libraries for domain-specific automation.":
			"Manage site skills - reusable JavaScript libraries for domain-specific automation.",
		"Export Skills": "Export Skills",
		"Import Skills": "Import Skills",
		"Search skills by name, domain, or description...": "Search skills by name, domain, or description...",
		"No skills match your search": "No skills match your search",
		"No skills created yet": "No skills created yet",
		"Name (cannot be changed)": "Name (cannot be changed)",
		"Edit Skill:": "Edit Skill:",
		Skills: "Skills",
		// Scheduled Tasks
		"Scheduled Tasks": "Scheduled Tasks",
		"New Task": "New Task",
		"Edit Task": "Edit Task",
		"Delete Task": "Delete Task",
		'Delete task "{name}"?': 'Delete task "{name}"?',
		"No scheduled tasks yet": "No scheduled tasks yet",
		"Create a scheduled task to automate web operations": "Create a scheduled task to automate web operations",
		"Task Name": "Task Name",
		Description: "Description",
		"Target URL": "Target URL",
		Schedule: "Schedule",
		"Run Once": "Run Once",
		Interval: "Interval",
		Cron: "Cron",
		"Execution Mode": "Execution Mode",
		Silent: "Silent",
		Visible: "Visible",
		"Silent mode runs the task in a background tab": "Silent mode runs the task in a background tab",
		"Visible mode runs the task in a foreground tab": "Visible mode runs the task in a foreground tab",
		"At:": "At:",
		"Every (minutes):": "Every (minutes):",
		"Cron Expression:": "Cron Expression:",
		"Cron Presets": "Cron Presets",
		"Every hour": "Every hour",
		"Every day at 9:00": "Every day at 9:00",
		"Every Monday at 9:00": "Every Monday at 9:00",
		"Every 1st of month at 9:00": "Every 1st of month at 9:00",
		"Prompt Template": "Prompt Template",
		"Advanced: override the default prompt template for this task.":
			"Advanced: override the default prompt template for this task.",
		Enabled: "Enabled",
		Disabled: "Disabled",
		"Last run": "Last run",
		"Next run": "Next run",
		History: "History",
		Success: "Success",
		Failed: "Failed",
		Timeout: "Timeout",
		Running: "Running",
		"Never run": "Never run",
		"Execution History": "Execution History",
		"No execution history": "No execution history",
		"Total runs": "Total runs",
		Duration: "Duration",
		"Open Session": "Open Session",
		"Task created": "Task created",
		"Task updated": "Task updated",
		"Task deleted": "Task deleted",
		"Invalid cron expression": "Invalid cron expression",
		"Please enter a task name": "Please enter a task name",
		"Please select a schedule time": "Please select a schedule time",
		"Please enter an interval in minutes": "Please enter an interval in minutes",
		"Please enter a cron expression": "Please enter a cron expression",
		"Save Task": "Save Task",
		Cancel: "Cancel",
		Enable: "Enable",
		Disable: "Disable",
		Edit: "Edit",
		"Task Name (required)": "Task Name (required)",
		"Description (optional)": "Description (optional)",
		"Target URL (optional, opens in task tab)": "Target URL (optional, opens in task tab)",
		"Create your first task to get started": "Create your first task to get started",
		"Manage scheduled tasks for automated web operations.": "Manage scheduled tasks for automated web operations.",
		"Minimum interval is 1 minute": "Minimum interval is 1 minute",
		"Once tasks are automatically disabled after execution": "Once tasks are automatically disabled after execution",
		"Use natural language to describe what the task should do":
			"Use natural language to describe what the task should do",
		"Task will run at the specified time": "Task will run at the specified time",
		"Task will repeat at the specified interval": "Task will repeat at the specified interval",
		"Task will follow the cron schedule": "Task will follow the cron schedule",
		Model: "Model",
		"Default (last used)": "Default (last used)",
		Select: "Select",
		Reset: "Reset",
		"Reset to default": "Reset to default",
		"Choose which AI model to use for this task. Default uses the last selected model.":
			"Choose which AI model to use for this task. Default uses the last selected model.",
	},
	de: {
		"Permission request failed": "Berechtigungsanfrage fehlgeschlagen",
		"JavaScript Execution Permission Required": "JavaScript-Ausführungsberechtigung erforderlich",
		"This extension needs permission to execute JavaScript code on web pages":
			"Diese Erweiterung benötigt die Berechtigung, JavaScript-Code auf Webseiten auszuführen",
		"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.":
			"Das JavaScript-REPL-Tool ermöglicht es der KI, Webseiten in Ihrem Auftrag zu lesen und damit zu interagieren. Dies erfordert die userScripts-Berechtigung, um Code sicher auszuführen.",
		"The AI can read and modify web page content when you ask it to":
			"Die KI kann Webseiteninhalte lesen und ändern, wenn Sie es verlangen",
		"Code runs in an isolated environment with security safeguards":
			"Code wird in einer isolierten Umgebung mit Sicherheitsvorkehrungen ausgeführt",
		"Network access is blocked to prevent data exfiltration":
			"Netzwerkzugriff ist blockiert, um Datenexfiltration zu verhindern",
		"You can revoke this permission at any time in browser settings":
			"Sie können diese Berechtigung jederzeit in den Browsereinstellungen widerrufen",
		"Writing JavaScript code...": "Schreibe JavaScript-Code...",
		"Execute JavaScript": "Führe JavaScript aus",
		"Preparing JavaScript...": "Bereite JavaScript vor...",
		"Getting skill": "Hole Skill",
		"Got skill": "Skill erhalten",
		"Listing skills": "Liste Skills auf",
		"Creating skill": "Erstelle Skill",
		"Created skill": "Skill erstellt",
		"Updating skill": "Aktualisiere Skill",
		"Updated skill": "Skill aktualisiert",
		"Rewriting skill": "Patche Skill",
		"Rewritten skill": "Skill gepatcht",
		"Deleting skill": "Lösche Skill",
		"Processing skill...": "Verarbeite Skill...",
		"No skills found": "Keine Skills gefunden",
		"Skills for domain": "Skills für Domain",
		"Deleted skill": "Skill gelöscht",
		Examples: "Beispiele",
		Library: "Bibliothek",
		"Command failed:": "Befehl fehlgeschlagen:",
		"Why is this needed?": "Warum ist das notwendig?",
		"What this means:": "Was das bedeutet:",
		"Continue Anyway": "Trotzdem fortfahren",
		"Requesting...": "Anfrage läuft...",
		"Grant Permission": "Berechtigung erteilen",
		"Navigating to": "Navigiere zu",
		"Click to open": "Klicken zum Öffnen",
		"Waiting...": "Warte...",
		Current: "Aktuell",
		Locked: "Gesperrt",
		"Export failed. Check console for details.": "Export fehlgeschlagen. Prüfen Sie die Konsole für Details.",
		"Invalid import file format": "Ungültiges Import-Dateiformat",
		"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.":
			"{count} doppelte Sitzungen gefunden. OK zum Überschreiben, Abbrechen zum Überspringen.",
		"Imported {imported} sessions, skipped {skipped} duplicates":
			"{imported} Sitzungen importiert, {skipped} Duplikate übersprungen",
		"Imported {count} sessions": "{count} Sitzungen importiert",
		"Import failed. Check console for details.": "Import fehlgeschlagen. Prüfen Sie die Konsole für Details.",
		Import: "Importieren",
		"Export All": "Alle exportieren",
		Export: "Exportieren",
		"No sessions older than {days} days": "Keine Sitzungen älter als {days} Tage",
		"Delete {count} sessions older than {days} days?": "{count} Sitzungen älter als {days} Tage löschen?",
		"Failed to delete sessions. Check console for details.":
			"Löschen fehlgeschlagen. Prüfen Sie die Konsole für Details.",
		"Delete Old": "Löschen",
		"All sessions": "Alle Sitzungen",
		"No sessions to delete": "Keine Sitzungen zum Löschen",
		"Delete ALL {count} sessions? This cannot be undone!":
			"ALLE {count} Sitzungen löschen? Dies kann nicht rückgängig gemacht werden!",
		"Older than 7 days": "Älter als 7 Tage",
		"Older than 30 days": "Älter als 30 Tage",
		"Older than 90 days": "Älter als 90 Tage",
		"Search sessions...": "Sitzungen durchsuchen...",
		"Total: {count} sessions · {messages} messages · ${cost}":
			"Gesamt: {count} Sitzungen · {messages} Nachrichten · ${cost}",
		"Open tabs": "Offene Tabs",
		"Waiting for selection": "Warte auf Auswahl",
		"Preparing element selector...": "Bereite Element-Auswahl vor...",
		About: "Über",
		"AI-powered browser extension for web navigation and interaction":
			"KI-gestützte Browser-Erweiterung für Webnavigation und -interaktion",
		"Version:": "Version:",
		Website: "Webseite",
		Imprint: "Impressum",
		Privacy: "Datenschutz",
		"Checking for updates...": "Suche nach Updates...",
		"Update Available": "Update verfügbar",
		"A new version ({version}) is available": "Eine neue Version ({version}) ist verfügbar",
		Update: "Aktualisieren",
		"You're up to date": "Sie sind auf dem neuesten Stand",
		"Update Required": "Update erforderlich",
		"A new version ({version}) is available. Please update to continue.":
			"Eine neue Version ({version}) ist verfügbar. Bitte aktualisieren Sie, um fortzufahren.",
		"Update Now": "Jetzt aktualisieren",
		// API Keys & OAuth tab
		"API Keys & OAuth": "API-Schlüssel & OAuth",
		Connected: "Verbunden",
		"Enter code:": "Code eingeben:",
		"Logging in...": "Anmeldung...",
		"Not connected": "Nicht verbunden",
		Logout: "Abmelden",
		Login: "Anmelden",
		"Login failed": "Anmeldung fehlgeschlagen",
		"Subscription Login": "Abonnement-Anmeldung",
		"Log in with your existing subscription. No API key needed. Tokens are stored locally and refreshed automatically.":
			"Melden Sie sich mit Ihrem bestehenden Abonnement an. Kein API-Schlüssel erforderlich. Tokens werden lokal gespeichert und automatisch erneuert.",
		"Enter API keys for cloud providers. Keys are stored locally in your browser.":
			"Geben Sie API-Schlüssel für Cloud-Anbieter ein. Schlüssel werden lokal in Ihrem Browser gespeichert.",
		// Welcome Setup Dialog
		"Welcome to Sitegeist": "Willkommen bei Sitegeist",
		"To get started, you need to connect at least one AI provider. You can either log in with an existing subscription (Anthropic, OpenAI, or GitHub Copilot) or enter an API key.":
			"Um zu beginnen, müssen Sie mindestens einen KI-Anbieter verbinden. Sie können sich entweder mit einem bestehenden Abonnement (Anthropic, OpenAI oder GitHub Copilot) anmelden oder einen API-Schlüssel eingeben.",
		"Set up provider": "Anbieter einrichten",
		// Skills Tab
		'Delete skill "{name}"?': 'Skill "{name}" löschen?',
		"Invalid skills file: expected an array of skills": "Ungültige Skill-Datei: ein Array von Skills erwartet",
		"Failed to import skills:": "Fehler beim Importieren der Skills:",
		"Imported {count} skill(s)": "{count} Skill(s) importiert",
		"Domain Patterns (comma-separated)": "Domain-Muster (kommagetrennt)",
		"Short Description": "Kurzbeschreibung",
		"Description (Markdown)": "Beschreibung (Markdown)",
		"Examples (JavaScript)": "Beispiele (JavaScript)",
		"Library Code": "Bibliothekscode",
		"Import Conflicts": "Importkonflikte",
		"The following skills already exist. Check the skills you want to overwrite:":
			"Die folgenden Skills existieren bereits. Markieren Sie die Skills, die überschrieben werden sollen:",
		"Import Selected": "Ausgewählte importieren",
		"Manage site skills - reusable JavaScript libraries for domain-specific automation.":
			"Site-Skills verwalten - wiederverwendbare JavaScript-Bibliotheken für domänenspezifische Automatisierung.",
		"Export Skills": "Skills exportieren",
		"Import Skills": "Skills importieren",
		"Search skills by name, domain, or description...": "Skills nach Name, Domain oder Beschreibung suchen...",
		"No skills match your search": "Keine Skills entsprechen Ihrer Suche",
		"No skills created yet": "Noch keine Skills erstellt",
		"Name (cannot be changed)": "Name (kann nicht geändert werden)",
		"Edit Skill:": "Skill bearbeiten:",
		Skills: "Skills",
		// Scheduled Tasks
		"Scheduled Tasks": "Scheduled Tasks",
		"New Task": "New Task",
		"Edit Task": "Edit Task",
		"Delete Task": "Delete Task",
		'Delete task "{name}"?': 'Delete task "{name}"?',
		"No scheduled tasks yet": "No scheduled tasks yet",
		"Create a scheduled task to automate web operations": "Create a scheduled task to automate web operations",
		"Task Name": "Task Name",
		Description: "Description",
		"Target URL": "Target URL",
		Schedule: "Schedule",
		"Run Once": "Run Once",
		Interval: "Interval",
		Cron: "Cron",
		"Execution Mode": "Execution Mode",
		Silent: "Silent",
		Visible: "Visible",
		"Silent mode runs the task in a background tab": "Silent mode runs the task in a background tab",
		"Visible mode runs the task in a foreground tab": "Visible mode runs the task in a foreground tab",
		"At:": "At:",
		"Every (minutes):": "Every (minutes):",
		"Cron Expression:": "Cron Expression:",
		"Cron Presets": "Cron Presets",
		"Every hour": "Every hour",
		"Every day at 9:00": "Every day at 9:00",
		"Every Monday at 9:00": "Every Monday at 9:00",
		"Every 1st of month at 9:00": "Every 1st of month at 9:00",
		"Prompt Template": "Prompt Template",
		"Advanced: override the default prompt template for this task.":
			"Advanced: override the default prompt template for this task.",
		Enabled: "Enabled",
		Disabled: "Disabled",
		"Last run": "Last run",
		"Next run": "Next run",
		History: "History",
		Success: "Success",
		Failed: "Failed",
		Timeout: "Timeout",
		Running: "Running",
		"Never run": "Never run",
		"Execution History": "Execution History",
		"No execution history": "No execution history",
		"Total runs": "Total runs",
		Duration: "Duration",
		"Open Session": "Open Session",
		"Task created": "Task created",
		"Task updated": "Task updated",
		"Task deleted": "Task deleted",
		"Invalid cron expression": "Invalid cron expression",
		"Please enter a task name": "Please enter a task name",
		"Please select a schedule time": "Please select a schedule time",
		"Please enter an interval in minutes": "Please enter an interval in minutes",
		"Please enter a cron expression": "Please enter a cron expression",
		"Save Task": "Save Task",
		Cancel: "Cancel",
		Enable: "Enable",
		Disable: "Disable",
		Edit: "Edit",
		"Task Name (required)": "Task Name (required)",
		"Description (optional)": "Description (optional)",
		"Target URL (optional, opens in task tab)": "Target URL (optional, opens in task tab)",
		"Create your first task to get started": "Create your first task to get started",
		"Manage scheduled tasks for automated web operations.": "Manage scheduled tasks for automated web operations.",
		"Minimum interval is 1 minute": "Minimum interval is 1 minute",
		"Once tasks are automatically disabled after execution": "Once tasks are automatically disabled after execution",
		"Use natural language to describe what the task should do":
			"Use natural language to describe what the task should do",
		"Task will run at the specified time": "Task will run at the specified time",
		"Task will repeat at the specified interval": "Task will repeat at the specified interval",
		"Task will follow the cron schedule": "Task will follow the cron schedule",
	},
	zh: {
		"Permission request failed": "权限请求失败",
		"JavaScript Execution Permission Required": "需要 JavaScript 执行权限",
		"This extension needs permission to execute JavaScript code on web pages":
			"此扩展需要权限才能在网页上执行 JavaScript 代码",
		"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.":
			"JavaScript REPL 工具允许 AI 代您读取和交互网页。这需要 userScripts 权限来安全地执行代码。",
		"The AI can read and modify web page content when you ask it to": "AI 可以在您要求时读取和修改网页内容",
		"Code runs in an isolated environment with security safeguards": "代码在具有安全保护的隔离环境中运行",
		"Network access is blocked to prevent data exfiltration": "网络访问已被阻止，以防止数据泄露",
		"You can revoke this permission at any time in browser settings": "您可以随时在浏览器设置中撤销此权限",
		"Writing JavaScript code...": "正在编写 JavaScript 代码...",
		"Execute JavaScript": "执行 JavaScript",
		"Preparing JavaScript...": "正在准备 JavaScript...",
		"Getting skill": "获取技能",
		"Got skill": "已获取技能",
		"Listing skills": "列出技能",
		"Creating skill": "创建技能",
		"Created skill": "已创建技能",
		"Updating skill": "更新技能",
		"Updated skill": "已更新技能",
		"Rewriting skill": "重写技能",
		"Rewritten skill": "已重写技能",
		"Deleting skill": "删除技能",
		"Processing skill...": "处理技能中...",
		"No skills found": "未找到技能",
		"Skills for domain": "域名技能",
		"Deleted skill": "已删除技能",
		Examples: "示例",
		Library: "库",
		"Command failed:": "命令失败:",
		"Why is this needed?": "为什么需要这个？",
		"What this means:": "这意味着：",
		"Continue Anyway": "仍然继续",
		"Requesting...": "请求中...",
		"Grant Permission": "授予权限",
		"Navigating to": "导航到",
		"Click to open": "点击打开",
		"Waiting...": "等待中...",
		Current: "当前",
		Locked: "已锁定",
		"Export failed. Check console for details.": "导出失败。请检查控制台获取详情。",
		"Invalid import file format": "无效的导入文件格式",
		"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.":
			"发现 {count} 个重复会话。点击确定覆盖，取消跳过重复项。",
		"Imported {imported} sessions, skipped {skipped} duplicates": "已导入 {imported} 个会话，跳过 {skipped} 个重复项",
		"Imported {count} sessions": "已导入 {count} 个会话",
		"Import failed. Check console for details.": "导入失败。请检查控制台获取详情。",
		Import: "导入",
		"Export All": "导出全部",
		Export: "导出",
		"No sessions older than {days} days": "没有超过 {days} 天的会话",
		"Delete {count} sessions older than {days} days?": "删除 {count} 个超过 {days} 天的会话？",
		"Failed to delete sessions. Check console for details.": "删除会话失败。请检查控制台获取详情。",
		"Delete Old": "删除旧会话",
		"All sessions": "所有会话",
		"No sessions to delete": "没有可删除的会话",
		"Delete ALL {count} sessions? This cannot be undone!": "删除全部 {count} 个会话？此操作无法撤销！",
		"Older than 7 days": "超过 7 天",
		"Older than 30 days": "超过 30 天",
		"Older than 90 days": "超过 90 天",
		"Search sessions...": "搜索会话...",
		"Total: {count} sessions · {messages} messages · ${cost}": "共计: {count} 个会话 · {messages} 条消息 · ${cost}",
		"Open tabs": "打开的标签页",
		"Waiting for selection": "等待选择",
		"Preparing element selector...": "正在准备元素选择器...",
		About: "关于",
		"AI-powered browser extension for web navigation and interaction": "AI 驱动的浏览器扩展，用于网页导航和交互",
		"Version:": "版本:",
		Website: "网站",
		Imprint: "版权声明",
		Privacy: "隐私",
		"Checking for updates...": "正在检查更新...",
		"Update Available": "有可用更新",
		"A new version ({version}) is available": "新版本 ({version}) 可用",
		Update: "更新",
		"You're up to date": "已是最新版本",
		"Update Required": "需要更新",
		"A new version ({version}) is available. Please update to continue.": "新版本 ({version}) 可用。请更新后继续。",
		"Update Now": "立即更新",
		// API Keys & OAuth tab
		"API Keys & OAuth": "API 密钥与 OAuth",
		Connected: "已连接",
		"Enter code:": "输入验证码：",
		"Logging in...": "登录中...",
		"Not connected": "未连接",
		Logout: "退出登录",
		Login: "登录",
		"Login failed": "登录失败",
		"Subscription Login": "订阅登录",
		"Log in with your existing subscription. No API key needed. Tokens are stored locally and refreshed automatically.":
			"使用现有订阅登录，无需 API 密钥。令牌存储在本地并自动刷新。",
		"Enter API keys for cloud providers. Keys are stored locally in your browser.":
			"输入云端提供商的 API 密钥。密钥存储在浏览器本地。",
		// Welcome Setup Dialog
		"Welcome to Sitegeist": "欢迎使用 Sitegeist",
		"To get started, you need to connect at least one AI provider. You can either log in with an existing subscription (Anthropic, OpenAI, or GitHub Copilot) or enter an API key.":
			"开始使用前，您需要连接至少一个 AI 提供商。您可以使用现有订阅（Anthropic、OpenAI 或 GitHub Copilot）登录，或输入 API 密钥。",
		"Set up provider": "设置提供商",
		// Skills Tab
		'Delete skill "{name}"?': "删除技能「{name}」？",
		"Invalid skills file: expected an array of skills": "无效的技能文件：需要技能数组",
		"Failed to import skills:": "导入技能失败：",
		"Imported {count} skill(s)": "已导入 {count} 个技能",
		"Domain Patterns (comma-separated)": "域名模式（逗号分隔）",
		"Short Description": "简短描述",
		"Description (Markdown)": "描述（Markdown）",
		"Examples (JavaScript)": "示例（JavaScript）",
		"Library Code": "库代码",
		"Import Conflicts": "导入冲突",
		"The following skills already exist. Check the skills you want to overwrite:":
			"以下技能已存在。勾选要覆盖的技能：",
		"Import Selected": "导入选中项",
		"Manage site skills - reusable JavaScript libraries for domain-specific automation.":
			"管理站点技能 - 用于特定领域自动化的可复用 JavaScript 库。",
		"Export Skills": "导出技能",
		"Import Skills": "导入技能",
		"Search skills by name, domain, or description...": "按名称、域名或描述搜索技能...",
		"No skills match your search": "没有匹配的技能",
		"No skills created yet": "尚未创建技能",
		"Name (cannot be changed)": "名称（不可更改）",
		"Edit Skill:": "编辑技能：",
		Skills: "技能",
		// Scheduled Tasks
		"Scheduled Tasks": "定时任务",
		"New Task": "新建任务",
		"Edit Task": "编辑任务",
		"Delete Task": "删除任务",
		'Delete task "{name}"?': "删除任务「{name}」？",
		"No scheduled tasks yet": "暂无定时任务",
		"Create a scheduled task to automate web operations": "创建定时任务以自动化网页操作",
		"Task Name": "任务名称",
		Description: "描述",
		"Target URL": "目标网址",
		Schedule: "计划",
		"Run Once": "单次执行",
		Interval: "间隔执行",
		Cron: "Cron 表达式",
		"Execution Mode": "执行模式",
		Silent: "静默",
		Visible: "可见",
		"Silent mode runs the task in a background tab": "静默模式在后台标签页中运行任务",
		"Visible mode runs the task in a foreground tab": "可见模式在前台标签页中运行任务",
		"At:": "时间：",
		"Every (minutes):": "每（分钟）：",
		"Cron Expression:": "Cron 表达式：",
		"Cron Presets": "Cron 预设",
		"Every hour": "每小时",
		"Every day at 9:00": "每天 9:00",
		"Every Monday at 9:00": "每周一 9:00",
		"Every 1st of month at 9:00": "每月 1 日 9:00",
		"Prompt Template": "提示词模板",
		"Advanced: override the default prompt template for this task.": "高级：覆盖此任务的默认提示词模板。",
		Enabled: "已启用",
		Disabled: "已禁用",
		"Last run": "上次运行",
		"Next run": "下次运行",
		History: "历史",
		Success: "成功",
		Failed: "失败",
		Timeout: "超时",
		Running: "运行中",
		"Never run": "从未运行",
		"Execution History": "执行历史",
		"No execution history": "暂无执行历史",
		"Total runs": "总执行次数",
		Duration: "执行时长",
		"Open Session": "打开会话",
		"Task created": "任务已创建",
		"Task updated": "任务已更新",
		"Task deleted": "任务已删除",
		"Invalid cron expression": "无效的 Cron 表达式",
		"Please enter a task name": "请输入任务名称",
		"Please select a schedule time": "请选择执行时间",
		"Please enter an interval in minutes": "请输入间隔分钟数",
		"Please enter a cron expression": "请输入 Cron 表达式",
		"Save Task": "保存任务",
		Cancel: "取消",
		Enable: "启用",
		Disable: "禁用",
		Edit: "编辑",
		"Task Name (required)": "任务名称（必填）",
		"Description (optional)": "描述（可选）",
		"Target URL (optional, opens in task tab)": "目标网址（可选，在任务标签页中打开）",
		"Create your first task to get started": "创建第一个任务以开始使用",
		"Manage scheduled tasks for automated web operations.": "管理定时任务以自动化网页操作。",
		"Minimum interval is 1 minute": "最小间隔为 1 分钟",
		"Once tasks are automatically disabled after execution": "单次任务执行后自动禁用",
		"Use natural language to describe what the task should do": "使用自然语言描述任务应执行的操作",
		"Task will run at the specified time": "任务将在指定时间运行",
		"Task will repeat at the specified interval": "任务将按指定间隔重复执行",
		"Task will follow the cron schedule": "任务将按照 Cron 计划执行",
		Model: "模型",
		"Default (last used)": "默认（上次使用）",
		Select: "选择",
		Reset: "重置",
		"Reset to default": "重置为默认",
		"Choose which AI model to use for this task. Default uses the last selected model.":
			"选择此任务使用的 AI 模型。默认使用上次选择的模型。",
	},
};

// Set default language to Chinese if no preference is stored
if (!localStorage.getItem("language")) {
	localStorage.setItem("language", "zh");
}

// Merge web-ui translations with sitegeist translations
const mergedTranslations = {
	en: { ...webUiTranslations.en, ...sitegeistTranslations.en },
	de: { ...webUiTranslations.de, ...sitegeistTranslations.de },
	zh: { ...webUiTranslations.zh, ...sitegeistTranslations.zh },
};

setTranslations(mergedTranslations);
