Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c node server.js >> mybookmark.log 2>&1", 0
Set WshShell = Nothing