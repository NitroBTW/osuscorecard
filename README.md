# osu! Scorecard Generator
## What is it?
This little amateur web-app can create a scorecard (kinda like a mini result screen) for any osu! score available on the website. I originally created this as a python app for use in my youtube series [TWIO](https://www.youtube.com/playlist?list=PLGQaEWEIOUKg-GWsFZLbx74Z6EB92CkQr) but I decided to create a web app as a GUI and then thought "What the hell why don't I give this to everyone?"... so I did. My HTML/CSS/Javascript leave a lot to be desired but here we are!

## How does it work?
osu!scorecard generator gets a score's data from the osu!api and then places that data into a little card template made with HTML and CSS. The app can then use the html-to-image library to turn that scorecard element into a png file that you can download and use to show off or post your score to reddit or whatever!

## Known bugs
- None :D

## To-Do
- Fix known bugs (obviously)
- Add unranked toggle for leaderboard
- Add inputs for the extra 300/100 types so you dont have to add them up manually
- Add user ID/username input for automatic name/rank/pfp fetching
- Allow resizing elements
- Allow changing fonts
- Look into allowing other API's (Ripple, Akatsuki, etc)

c