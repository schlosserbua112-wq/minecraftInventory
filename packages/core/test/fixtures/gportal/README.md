# Rohausgaben vom echten G-Portal-Server (Fabric, 2026-10-30)

`rcon/*.txt`: Zeile 1 = Befehl, darunter die vollständige Antwort.

Wichtig: Der Server teilt lange Antworten in mehrere RCON-Pakete zu je 4096 Zeichen
(alle mit derselben Request-ID, Typ 0). `data get entity Tomsen04` kam in 9 Paketen
(34 413 Zeichen), `data get entity HiaxxxX` in 11 Paketen (43 353 Zeichen).
Das Ende der Antwort erkennt man zuverlässig, indem man direkt nach dem Befehl ein
leeres Paket vom Typ 0 mit eigener ID schickt: Der Server antwortet darauf mit
`Unknown request 0`, und zwar erst nach allen Teilpaketen des Befehls.
Die Dateien hier sind aus allen Teilpaketen zusammengesetzt.
