extends TestCase
## Each spring is drawn facing the way it launches (director: the diagonal
## ones pointed the wrong way).

const SCENES := [
	"res://levels/objects/spring_up.tscn",
	"res://levels/objects/spring_diagonal.tscn",
	"res://levels/objects/spring_side.tscn",
]


func test_springs_point_where_they_launch() -> void:
	var player: Player = add_scene("res://player/player.tscn")
	for path in SCENES:
		for facing in [1, -1]:
			var spring: LevelSpring = add_scene(path)
			spring.facing = facing
			var launch := Vector2(0.0, -1.0) if spring.kind == LevelSpring.Kind.UP \
					else spring.launch_velocity(player).normalized()
			var drawn := spring.spring_transform().basis_xform(Vector2.UP).normalized()
			assert_true(drawn.dot(launch) > 0.99,
					"%s facing %d: drawn %s, launches %s" % [path.get_file(), facing, drawn, launch])
