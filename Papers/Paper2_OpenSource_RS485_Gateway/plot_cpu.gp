set terminal pdf enhanced color font "Times-Roman,10" size 3.5, 2.5
set output "cpu_usage.pdf"
set title "System Resource Utilization vs. Load"
set xlabel "Number of Tags"
set ylabel "CPU Usage (%)"
set y2label "Memory Usage (MB)"
set ytics nomirror
set y2tics
set grid
set key left top
set style fill solid 0.5
set boxwidth 0.5 relative

set style line 1 lc rgb '#4DAF4A' lt 1 lw 2 pt 7 ps 0.5   # Green for CPU
set style line 2 lc rgb '#984EA3' lt 1 lw 2 pt 5 ps 0.5   # Purple for Mem

plot "data/cpu_usage.dat" using 1:2 with linespoints ls 1 title "CPU Usage" axis x1y1, \
     "data/cpu_usage.dat" using 1:3 with linespoints ls 2 title "Memory Usage" axis x1y2
