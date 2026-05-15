Place a Linux x86_64 `IfcConvert` binary here for fully automatic plugin deployment.

Expected path:

`vendor/ifcconvert/linux-amd64/IfcConvert`

Requirements:

- Executable bit enabled (`chmod +x`)
- Built with COLLADA support (`.dae`) for OpenProject IFC pipeline
- Compatible with target server glibc and libraries

The plugin's auto-ensure script will prioritize this bundled binary and install it to:

`/opt/openproject/plugins/costos/bin/IfcConvert`
