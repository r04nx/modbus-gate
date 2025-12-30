set terminal pdf enhanced color font "Times-Roman,10" size 3.5, 2.5
set output "dynamic_polling_adaptation.pdf"
set title "Content-Aware Dynamic Polling Adaptation"
set xlabel "Simulation Time (s)"
set ylabel "Polling Interval (s)"
set y2label "Signal Rate of Change (d/dt)"
set ytics nomirror
set y2tics
set grid
set key left top

set style line 1 lc rgb '#E41A1C' lt 1 lw 2 pt 7 ps 0.5   # Red - Interval
set style line 2 lc rgb '#377EB8' lt 1 lw 1 pt 5 ps 0.3   # Blue - Delta

plot "Papers/Paper1_Adaptive_Edge_Gateway/data/dynamic_polling.dat" using 1:2 with lines ls 1 title "Poll Interval" axis x1y1, \
     "Papers/Paper1_Adaptive_Edge_Gateway/data/dynamic_polling.dat" using 1:3 with impulses ls 2 title "Signal Delta" axis x1y2
