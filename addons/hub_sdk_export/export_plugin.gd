@tool
extends EditorExportPlugin
## The HTML shell imports ./hub-sdk/index.js. Godot does not copy loose files
## next to the web export, so this places the vendored JS (no .map files) there.


var _path := ""
var _web := false


func _get_name() -> String:
	return "HubSdkExport"


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
	_inject_hub_url(_html_path(dest_root))


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
