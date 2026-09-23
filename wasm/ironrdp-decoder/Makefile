.PHONY: build clean

build:
	RUSTFLAGS="--remap-path-prefix=$$HOME=build" wasm-pack build --target web --release --out-dir ../../frontend/src/lib/ironrdp-decoder --out-name sanctum_rdp_decoder

clean:
	cargo clean
