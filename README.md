accidentalbot
=============

Node/websockets based IRC bot.

Work in progress.

In the webclient/ directory there is a javascript and HTML file that
show the general idea behind how a client would work.

Note that for Heroku-based deployments, you will need to enable WebSockets for
your app, and set an environment variable to indicate that you're running
behind a reverse proxy:

    heroku labs:enable websockets -a APPNAME
    heroku config:set PROXIED true -a APPNAME
