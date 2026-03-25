@echo off
echo Demarrage du serveur local...
echo Ouvrez votre navigateur sur : http://localhost:8080
echo Appuyez sur Ctrl+C pour arreter.
python -m http.server 8080
pause
