'use strict';

window.Showbot = window.Showbot || {};

Showbot.Bot = (function ($) {

	// Templates
	var titleRowTemplate = null;
    var linkRowTemplate = null;
	var connectingTemplate = null;

	// State
	var connection = null;

	function init() {
		$(function () {
            titleRowTemplate = titleRowTemplate || Handlebars.compile($("#titleRow").html());
            linkRowTemplate = linkRowTemplate || Handlebars.compile($('#linkRow').html());
			connectingTemplate = connectingTemplate || Handlebars.compile($('#connectingMessage').html());

			Handlebars.registerHelper('timeAgo', function (date) {
                return moment(date).fromNow();
			});

			connectSocket();

			// Show the connecting message
			$(".message").html(connectingTemplate());
		});
	}

    function voteHandler(anchor) {
        var id = $(anchor).closest('tr').data('id');
        connection.send(JSON.stringify({operation: 'VOTE', id: id}));
        var voteSpan = $(anchor).parent().find('.votes');
        voteSpan.html(Number(voteSpan.html()) + 1);
        $(anchor).remove();
        return false;
    }

    function linkHandler(anchor) {
        var link = $(anchor).attr('href');
        var answer = confirm("Tread carefully; these links aren't checked for safety!\nWould you like to go to the following URL?\n\n" + link);
        if (answer) {
            window.location = link;
        }
        return false;
    }

	function resetToDefault(){
		$('.message').fadeOut(function () {
			$('.tables').fadeIn();
		});
	}

    function ping() {
        if (connection != null) {
            connection.send(JSON.stringify({operation: 'PING'}));
        }
        $('.time').each(function () {
            var time = $(this).data('time');
            var ago = moment(time).fromNow();
            $(this).html(moment($(this).data('time')).fromNow())
        });
    }

	function connectSocket() {
		if (connection == null || connection.readyState == 3) {
			// Connect to the server and await feedback.
            if (window.location.hostname == 'localhost' || window.location.hostname == '') {
                connection = new WebSocket('ws://localhost:5001');
            } else {
	            connection = new WebSocket('ws://thawing-bayou-3232.herokuapp.com:80');
            }

			connection.onopen = function (event) {
				resetToDefault();
                setInterval(ping, 30000);
			};

			connection.onmessage = function (message) {
				var packet = JSON.parse(message.data);
                //console.log(JSON.stringify(packet));
                if (packet.operation == 'REFRESH') {
                    // Refresh everything
                    var titles = packet.titles;
    				$('.titles tbody').empty();
                    var html = "";
					
					// Sort the titles by vote
					titles = titles.sort(function(a,b){return b.votes - a.votes;});
					
					// Create all the rows
					var titlesAlreadyVoted = [];
                    for (var i=0; i < titles.length; ++i) {
                        html += titleRowTemplate(titles[i]);
						if (titles[i].voted) {
							titlesAlreadyVoted.push(titles[i].id);
						}
                    }

					// Add to the table
                    $('.titles tbody').html(html);

					// Remove all the anchors for already voted titles
					console.log(JSON.stringify(titlesAlreadyVoted));
					for (var i=0; i < titlesAlreadyVoted.length; ++i) {
						$('tr[data-id=' + titlesAlreadyVoted[i] + ']').find('a').remove();
					}

					// Show the table
                    if (!$('.titles').is(':visible')) {
                        $('.titles').fadeIn();
                    }

                    var links = packet['links'];
                    html = '';
                    for (var i=0; i < links.length; ++i) {
                        html += linkRowTemplate(links[i]);
                    }
                    $('.links tbody').html(html);
                    if (!$('.links').is(':visible')) {
                        $('.links').fadeIn();
                    }
                } else if (packet.operation == 'NEW') {
                    // New title
                    $('.titles tbody').append(titleRowTemplate(packet.title));
                } else if (packet.operation == 'NEWLINK') {
                    $('.links tbody').append(linkRowTemplate(packet.link));
                } else if (packet.operation == 'VOTE') {
                    // Modify a vote
                    var row = $('tr[data-id=' + packet.id + ']');
                    var span = $(row).find('.votes').html(packet.votes);
                } else if (packet.operation == 'PONG') {
                    // NOOP
                }
			};

			connection.onclose = function (event) {
				$('.tables').fadeOut(function () {
                    $('.message').fadeIn();
                });
                setTimeout(connectSocket, 5000);
                clearInterval(ping);
			};

			connection.onerror = function (error) {
				console.log("Error: " + JSON.stringify(error));
			};
		} else {
			setTimeout(connectSocket, 5000);
		}
	}

	return {
		init: init,
        voteHandler: voteHandler,
        linkHandler: linkHandler
	};
})(jQuery);
