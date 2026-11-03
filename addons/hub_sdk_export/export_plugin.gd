@tool
extends EditorExportPlugin
## The HTML shell imports ./hub-sdk/index.js. Godot does not copy loose files
## next to the web export, so this places the vendored JS (no .map files) there.


var _path := ""
var _web := false

const _BASE_MARKER := "<!-- HPOS_BASE -->"
const _BASE_JS_MARKER := "window.hposBasePath = \"\";"


func _get_name() -> String:
	return "HubSdkExport"


## Web preset option. Empty keeps today's relative URLs. HPOS_BASE_PATH wins
## when it is set, so CI can pin dev (/play/hpos10i/) or prod (/hpos10i/)
## without editing this file.
func _get_export_options(platform: EditorExportPlatform) -> Array[Dictionary]:
	if not platform is EditorExportPlatformWeb:
		return []
	return [{
		"option": {
			"name": "html/base_path",
			"type": TYPE_STRING,
			"hint": PROPERTY_HINT_PLACEHOLDER_TEXT,
			"hint_string": "/hpos10i/ or /play/hpos10i/ — empty keeps relative URLs",
		},
		"default_value": "",
	}]


func _get_export_option_warning(platform: EditorExportPlatform, option: String) -> String:
	if option != "html/base_path" or not platform is EditorExportPlatformWeb:
		return ""
	var value := _preset_base_path()
	if value == "" or _safe_base_path(value):
		return ""
	return "Use a path like /hpos10i/ or /play/hpos10i/, or an http(s) URL. Empty keeps relative URLs. HPOS_BASE_PATH overrides this at export."


func _export_begin(features: PackedStringArray, _is_debug: bool, path: String, _flags: int) -> void:
	_path = path
	_web = features.has("web")


func _export_end() -> void:
	if not _web or _path == "":
		return
	var src := ProjectSettings.globalize_path("res://web/hub-sdk")
	var dest_root := _path.get_base_dir()
	if dest_root.is_relative_path():
		dest_root = ProjectSettings.globalize_path("res://").path_join(dest_root)
	var dest := dest_root.path_join("hub-sdk")
	var from := DirAccess.open(src)
	if from == null:
		push_error("[HubSdkExport] missing vendored SDK at %s" % src)
		return
	DirAccess.make_dir_recursive_absolute(dest)
	var copied := 0
	for name in from.get_files():
		if not name.ends_with(".js") or name.ends_with(".map"):
			continue
		var bytes := FileAccess.get_file_as_bytes(src.path_join(name))
		if bytes.is_empty():
			push_error("[HubSdkExport] could not read %s" % name)
			continue
		var out := FileAccess.open(dest.path_join(name), FileAccess.WRITE)
		if out == null:
			push_error("[HubSdkExport] could not write %s" % name)
			continue
		out.store_buffer(bytes)
		out.close()
		copied += 1
	print("[HubSdkExport] copied %d hub-sdk files to %s" % [copied, dest])
	var html_path := _html_path(dest_root)
	_inject_hub_url(html_path)
	_inject_server_key(html_path)
	_apply_base_path(html_path)


## HPOS_HUB_URL is a build-time setting (CI env or a shell export). Empty keeps
## the dev default /hub/ already written in the shell.
func _inject_hub_url(html_path: String) -> void:
	var configured := OS.get_environment("HPOS_HUB_URL").strip_edges()
	if configured == "":
		print("[HubSdkExport] HPOS_HUB_URL unset; hub URL stays /hub/")
		return
	if not _safe_hub_url(configured):
		push_error("[HubSdkExport] ignoring HPOS_HUB_URL; use /hub/ or an http(s) URL")
		return
	if not FileAccess.file_exists(html_path):
		push_error("[HubSdkExport] exported HTML missing at %s" % html_path)
		return
	var text := FileAccess.get_file_as_string(html_path)
	var marker := "window.hposHubUrl = \"/hub/\";"
	if not text.contains(marker):
		push_error("[HubSdkExport] hub URL marker missing from the shell")
		return
	var out := FileAccess.open(html_path, FileAccess.WRITE)
	if out == null:
		push_error("[HubSdkExport] could not rewrite %s" % html_path)
		return
	out.store_string(text.replace(marker, "window.hposHubUrl = %s;" % JSON.stringify(configured)))
	out.close()
	print("[HubSdkExport] hub URL set from HPOS_HUB_URL")


## HPOS_NAKAMA_SERVER_KEY is a build-time setting (CI env or a shell export). It is
## Nakama's client server key, never the runtime HTTP key. Locally it is the stock
## key from metaverse-hub/server/.env. Unset leaves the shell's empty key, and the
## server refuses every ticket redeem.
func _inject_server_key(html_path: String) -> void:
	var configured := OS.get_environment("HPOS_NAKAMA_SERVER_KEY").strip_edges()
	if configured == "":
		push_warning("[HubSdkExport] HPOS_NAKAMA_SERVER_KEY unset; this build cannot redeem hub tickets")
		return
	if not FileAccess.file_exists(html_path):
		push_error("[HubSdkExport] exported HTML missing at %s" % html_path)
		return
	var text := FileAccess.get_file_as_string(html_path)
	var marker := "window.hposServerKey = \"\";"
	if not text.contains(marker):
		push_error("[HubSdkExport] server key marker missing from the shell")
		return
	var out := FileAccess.open(html_path, FileAccess.WRITE)
	if out == null:
		push_error("[HubSdkExport] could not rewrite %s" % html_path)
		return
	out.store_string(text.replace(marker, "window.hposServerKey = %s;" % JSON.stringify(configured)))
	out.close()
	print("[HubSdkExport] server key set from HPOS_NAKAMA_SERVER_KEY")


func _html_path(dest_root: String) -> String:
	if _path.get_file().ends_with(".html"):
		return _path if _path.is_absolute_path() else ProjectSettings.globalize_path("res://").path_join(_path)
	return dest_root.path_join("index.html")


func _safe_hub_url(url: String) -> bool:
	if url.length() > 300 or url.contains("\"") or url.contains("'") or url.contains("\\"):
		return false
	if url.contains("\n") or url.contains("\r") or url.contains("<") or url.contains(">") or url.contains(" "):
		return false
	return url.begins_with("https://") or url.begins_with("http://") or url.begins_with("/")


## HPOS_BASE_PATH (CI or the shell) overrides the Web preset html/base_path.
## Empty keeps relative URLs, which is what GitHub Pages and a directory
## serve already rely on. A set value inserts <base href> so index.js, the
## wasm and the pack resolve there, and rewrites root-absolute shell URLs
## onto that base. The hub URL is not one of those.
func _apply_base_path(html_path: String) -> void:
	var from_env := OS.get_environment("HPOS_BASE_PATH").strip_edges()
	var base := _resolved_base_path()
	if not FileAccess.file_exists(html_path):
		push_error("[HubSdkExport] exported HTML missing at %s" % html_path)
		return
	if base == "":
		if from_env == "" and _preset_base_path() == "":
			print("[HubSdkExport] HPOS base path unset; asset URLs stay relative to the page")
		return
	var text := FileAccess.get_file_as_string(html_path)
	if not text.contains(_BASE_MARKER):
		push_error("[HubSdkExport] base path marker missing from the shell")
		return
	if not text.contains(_BASE_JS_MARKER):
		push_error("[HubSdkExport] base path script marker missing from the shell")
		return
	if not text.contains("const GODOT_CONFIG = "):
		push_error("[HubSdkExport] GODOT_CONFIG missing; base path not applied")
		return
	var preserved := _preserve_for_base(text)
	var rewritten: String = preserved["html"]
	rewritten = _rewrite_root_absolute(rewritten, base)
	rewritten = _rewrite_relative_attrs(rewritten, base)
	var sdk_root := _with_base(base, "hub-sdk/")
	rewritten = rewritten.replace("from \"./hub-sdk/", "from \"%s" % sdk_root)
	rewritten = _restore_preserved(rewritten, preserved)
	var exe := _executable_name(text)
	rewritten = rewritten.replace(_BASE_JS_MARKER, "window.hposBasePath = %s;" % JSON.stringify(base))
	rewritten = rewritten.replace(_BASE_MARKER, "<base href=\"%s\">" % base)
	if exe == "" or _executable_name(rewritten) != exe or not rewritten.contains("\"%s.pck\"" % exe):
		push_error("[HubSdkExport] base path rewrite would change the engine filenames; not applied")
		return
	var out := FileAccess.open(html_path, FileAccess.WRITE)
	if out == null:
		push_error("[HubSdkExport] could not rewrite %s" % html_path)
		return
	out.store_string(rewritten)
	out.close()
	var source := "HPOS_BASE_PATH" if from_env != "" else "html/base_path"
	print("[HubSdkExport] base path %s from %s" % [base, source])


func _executable_name(html: String) -> String:
	var needle := "\"executable\":\""
	var at := html.find(needle)
	if at < 0:
		return ""
	at += needle.length()
	var stop := html.find("\"", at)
	if stop < 0:
		return ""
	return html.substr(at, stop - at)


func _resolved_base_path() -> String:
	var from_env := OS.get_environment("HPOS_BASE_PATH").strip_edges()
	if from_env != "":
		if not _safe_base_path(from_env):
			push_error("[HubSdkExport] ignoring HPOS_BASE_PATH; use a path like /hpos10i/ or an http(s) URL")
			return ""
		return _normalize_base_path(from_env)
	var preset := _preset_base_path()
	if preset == "":
		return ""
	if not _safe_base_path(preset):
		push_error("[HubSdkExport] ignoring html/base_path; use a path like /hpos10i/ or an http(s) URL")
		return ""
	return _normalize_base_path(preset)


func _preset_base_path() -> String:
	if get_export_preset() == null:
		return ""
	var raw: Variant = get_option(&"html/base_path")
	if raw == null:
		return ""
	return str(raw).strip_edges()


func _normalize_base_path(raw: String) -> String:
	var value := raw.strip_edges()
	if value == "" or value == "." or value == "./":
		return ""
	if value.begins_with("http://") or value.begins_with("https://"):
		if not value.ends_with("/"):
			value += "/"
		return value
	if not value.begins_with("/"):
		value = "/" + value
	if not value.ends_with("/"):
		value += "/"
	return value


func _safe_base_path(raw: String) -> bool:
	var value := raw.strip_edges()
	if value == "" or value.length() > 300:
		return false
	if value.contains("\"") or value.contains("'") or value.contains("\\"):
		return false
	if value.contains("\n") or value.contains("\r") or value.contains("<") or value.contains(">") or value.contains(" "):
		return false
	if value.contains("#") or value.contains("?") or value.contains("&") or value.contains(".."):
		return false
	if value.begins_with("https://") or value.begins_with("http://"):
		return _safe_absolute_base(value)
	if value.begins_with("//"):
		return false
	return _safe_path_base(value)


func _safe_absolute_base(value: String) -> bool:
	var rest := value.substr(value.find("://") + 3)
	if rest == "" or rest.begins_with("/"):
		return false
	var slash := rest.find("/")
	var host := rest if slash < 0 else rest.substr(0, slash)
	if host == "" or not _host_ok(host):
		return false
	if slash < 0:
		return true
	return _safe_path_base(rest.substr(slash))


func _safe_path_base(value: String) -> bool:
	var body := value
	if body.begins_with("/"):
		body = body.substr(1)
	if body.ends_with("/"):
		body = body.substr(0, body.length() - 1)
	if body == "":
		return true
	for part in body.split("/"):
		if not _path_segment(part):
			return false
	return true


func _host_ok(host: String) -> bool:
	for i in host.length():
		var c := host.unicode_at(i)
		var ok := (c >= 48 and c <= 57) or (c >= 65 and c <= 90) or (c >= 97 and c <= 122) or c == 45 or c == 46 or c == 58
		if not ok:
			return false
	return true


func _path_segment(part: String) -> bool:
	if part == "" or part == "." or part == "..":
		return false
	for i in part.length():
		var c := part.unicode_at(i)
		var ok := (c >= 48 and c <= 57) or (c >= 65 and c <= 90) or (c >= 97 and c <= 122) or c == 45 or c == 95 or c == 46
		if not ok:
			return false
	return true


func _path_only(base: String) -> String:
	var path := base
	if path.begins_with("https://") or path.begins_with("http://"):
		var rest := path.substr(path.find("://") + 3)
		var slash := rest.find("/")
		path = "/" if slash < 0 else rest.substr(slash)
	if not path.begins_with("/"):
		path = "/" + path
	if not path.ends_with("/"):
		path += "/"
	return path


func _origin_of(base: String) -> String:
	var scheme_end := base.find("://")
	if scheme_end < 0:
		return ""
	var rest := base.substr(scheme_end + 3)
	var slash := rest.find("/")
	var host := rest if slash < 0 else rest.substr(0, slash)
	return base.substr(0, scheme_end + 3) + host


## Join a shell URL onto the build base. http(s) URLs and the hub path stay put.
func _with_base(base: String, url: String) -> String:
	if base == "" or url == "":
		return url
	if url.begins_with("http://") or url.begins_with("https://") or url.begins_with("//"):
		return url
	if url.begins_with("data:") or url.begins_with("#") or url.begins_with("mailto:"):
		return url
	if url == "/hub" or url.begins_with("/hub/") or url.begins_with("/hub?") or url.begins_with("/hub#"):
		return url
	var root := base if base.ends_with("/") else base + "/"
	if url.begins_with("/"):
		var path_base := _path_only(root)
		if path_base != "/" and (url == path_base.rstrip("/") or url.begins_with(path_base)):
			if root.begins_with("http://") or root.begins_with("https://"):
				return _origin_of(root) + url
			return url
		if path_base == "/" and not (root.begins_with("http://") or root.begins_with("https://")):
			return url
		return root.rstrip("/") + url
	var rel := url
	if rel.begins_with("./"):
		rel = rel.substr(2)
	while rel.begins_with("/"):
		rel = rel.substr(1)
	return root + rel


func _preserve_for_base(html: String) -> Dictionary:
	var config := _cut_span(html, "const GODOT_CONFIG = ", ";", "___HPOS_CONFIG_TOKEN___")
	# Through the end of the line, so a semicolon inside the hub URL stays put.
	var hub := _cut_span(config["html"], "window.hposHubUrl", "\n", "___HPOS_HUB_TOKEN___")
	return {"html": hub["html"], "config": config["chunk"], "hub": hub["chunk"]}


func _restore_preserved(html: String, preserved: Dictionary) -> String:
	return html.replace("___HPOS_HUB_TOKEN___", preserved["hub"]).replace("___HPOS_CONFIG_TOKEN___", preserved["config"])


func _cut_span(html: String, start_needle: String, end_needle: String, token: String) -> Dictionary:
	var start := html.find(start_needle)
	if start < 0:
		return {"html": html, "chunk": ""}
	var end := html.find(end_needle, start)
	if end < 0:
		return {"html": html, "chunk": ""}
	end += end_needle.length()
	return {
		"html": html.substr(0, start) + token + html.substr(end),
		"chunk": html.substr(start, end - start),
	}


func _rewrite_root_absolute(html: String, base: String) -> String:
	var re := RegEx.new()
	# A self-closing "/>" is not a URL. Keep the match to a single path token.
	if re.compile("([\"'])(/(?!/)[^\"'\\s<>]*)\\1") != OK:
		push_error("[HubSdkExport] base path pattern failed to compile")
		return html
	return _replace_urls(html, re, 1, 2, base)


func _rewrite_relative_attrs(html: String, base: String) -> String:
	var re := RegEx.new()
	if re.compile("(src|href)=(\"|')([^\"']*)\\2") != OK:
		push_error("[HubSdkExport] base path attribute pattern failed to compile")
		return html
	var out := ""
	var cursor := 0
	for found in re.search_all(html):
		var start := found.get_start()
		var end := found.get_end()
		out += html.substr(cursor, start - cursor)
		var attr := found.get_string(1)
		var quote := found.get_string(2)
		var url := found.get_string(3)
		out += "%s=%s%s%s" % [attr, quote, _with_base(base, url), quote]
		cursor = end
	out += html.substr(cursor)
	return out


func _replace_urls(html: String, re: RegEx, quote_group: int, url_group: int, base: String) -> String:
	var out := ""
	var cursor := 0
	for found in re.search_all(html):
		var start := found.get_start()
		var end := found.get_end()
		out += html.substr(cursor, start - cursor)
		var quote := found.get_string(quote_group)
		var url := found.get_string(url_group)
		if url.contains("<") or url.contains(">") or url.contains(" ") or url.contains("\n") or url.contains("\r"):
			out += html.substr(start, end - start)
		else:
			out += quote + _with_base(base, url) + quote
		cursor = end
	out += html.substr(cursor)
	return out
