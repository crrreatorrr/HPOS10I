class_name TestCase
extends RefCounted
## Base class for headless tests. Every method named test_* runs once, in a
## fresh instance. Tests may be coroutines (use await). Owned by the lead.

var tree: SceneTree

var _failures := PackedStringArray()
var _nodes: Array[Node] = []


func before_each() -> void:
	pass


func after_each() -> void:
	pass


func fail(message: String) -> void:
	_failures.append(message)


func assert_true(condition: bool, message := "expected true") -> void:
	if not condition:
		fail(message)


func assert_eq(actual, expected, message := "") -> void:
	if actual != expected:
		fail("%s expected %s, got %s" % [message, str(expected), str(actual)])


func assert_near(actual: float, expected: float, tolerance: float, message := "") -> void:
	if absf(actual - expected) > tolerance:
		fail("%s expected %s ± %s, got %s" % [message, expected, tolerance, actual])


## Instances a scene under the tree root. Freed automatically after the test.
func add_scene(path: String) -> Node:
	var node: Node = load(path).instantiate()
	tree.root.add_child(node)
	_nodes.append(node)
	return node


## Adds an existing node under the tree root. Freed automatically.
func add_node(node: Node) -> Node:
	tree.root.add_child(node)
	_nodes.append(node)
	return node


func physics_frames(count: int) -> void:
	for i in count:
		await tree.physics_frame


func press(action: StringName) -> void:
	Input.action_press(action)


func release(action: StringName) -> void:
	Input.action_release(action)


func _cleanup() -> void:
	for action in InputMap.get_actions():
		Input.action_release(action)
	for node in _nodes:
		if is_instance_valid(node):
			node.queue_free()
	_nodes.clear()
