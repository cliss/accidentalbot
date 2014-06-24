accidentalbot
=============

Node/websockets based IRC bot.

Work in progress.

In the webclient/ directory there is a javascript and HTML file that
show the general idea behind how a client would work.

Note that for Heroku-based deployments, you will need to enable
WebSockets for your app:

    heroku labs:enable websockets -a APPNAME

To enable Memcached caching on Heroku, you will need to add the
Memcachier addon for your app:

    heroku addons:add memcachier -a APPNAME
