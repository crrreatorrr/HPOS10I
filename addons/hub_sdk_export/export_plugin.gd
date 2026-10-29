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
