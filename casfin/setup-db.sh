#!/bin/bash
psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
echo "DONE"
