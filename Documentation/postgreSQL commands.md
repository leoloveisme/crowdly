# Drop existing DB as superuser
sudo -u postgres dropdb cardtalk

# Recreate it owned by lad (you'll be prompted for lad's password if needed)
createdb -h localhost -U lad cardtalk

