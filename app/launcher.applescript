-- Magpie launcher (compiled to a Cocoa-backed .app via osacompile -s).
--
-- Why AppleScript? A plain Python script does not register with the macOS
-- window server, so re-activating the bundle (double-click while running)
-- causes the Dock icon to bounce forever waiting for an activation it
-- cannot receive. osacompile produces a proper Cocoa app with a real run
-- loop, so reopen / quit events fire as expected.
--
-- Why a Python helper for the server? AppleScript's `do shell script`
-- inherits hidden capture FDs to any backgrounded child, and bash will
-- not return control until those FDs close. Daemonizing in Python lets us
-- close every inherited FD before serving — the calling shell gets EOF
-- and returns immediately.

property serverPort : 0
property serverPID  : 0

on run
	set bundlePath to POSIX path of (path to me)
	set webDir       to bundlePath & "Contents/Resources/web"
	set startScript  to bundlePath & "Contents/Resources/start_server.py"

	-- Pick a free port.
	set serverPort to (do shell script "/usr/bin/python3 -c 'import socket; s=socket.socket(); s.bind((\"127.0.0.1\",0)); print(s.getsockname()[1]); s.close()'") as integer

	-- Spawn the HTTP server as a fully detached daemon. The Python helper
	-- prints the daemon PID to stdout and exits.
	set startCmd to "/usr/bin/python3 " & quoted form of startScript & " " & serverPort & " " & quoted form of webDir
	set serverPID to (do shell script startCmd) as integer

	-- Open the browser.
	delay 0.3
	do shell script "/usr/bin/open " & quoted form of ("http://127.0.0.1:" & serverPort & "/")
end run

on reopen
	-- User double-clicked while we were already running.
	if serverPort is greater than 0 then
		do shell script "/usr/bin/open " & quoted form of ("http://127.0.0.1:" & serverPort & "/")
	end if
end reopen

on quit
	if serverPID is greater than 0 then
		try
			do shell script "/bin/kill " & serverPID
		end try
	end if
	continue quit
end quit
