class_name UuidV7
extends RefCounted
## RFC 9562 UUIDv7. Hub write keys are minted once and then reused, so a retry
## hits the same idempotency row instead of opening a second one.


static func mint() -> String:
	var unix_ms := int(Time.get_unix_time_from_system() * 1000.0)
	var rand := Crypto.new().generate_random_bytes(10)
	var bytes := PackedByteArray()
	bytes.resize(16)
	bytes[0] = (unix_ms >> 40) & 0xFF
	bytes[1] = (unix_ms >> 32) & 0xFF
	bytes[2] = (unix_ms >> 24) & 0xFF
	bytes[3] = (unix_ms >> 16) & 0xFF
	bytes[4] = (unix_ms >> 8) & 0xFF
	bytes[5] = unix_ms & 0xFF
	for i in 10:
		bytes[6 + i] = rand[i]
	# Version 7, variant 10.
	bytes[6] = (bytes[6] & 0x0F) | 0x70
	bytes[8] = (bytes[8] & 0x3F) | 0x80
	var hex := bytes.hex_encode()
	return "%s-%s-%s-%s-%s" % [
		hex.substr(0, 8), hex.substr(8, 4), hex.substr(12, 4), hex.substr(16, 4), hex.substr(20, 12),
	]
