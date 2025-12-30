set terminal pdf enhanced color font "Times-Roman,10" size 3.5, 2.5
set output "cycle_time_comparison.pdf"
set title "Polling Cycle Time vs. Number of Tags"
set xlabel "Number of Tags (Registers)"
set ylabel "Cycle Time (seconds)"
set grid
set key left top
set yrange [0:18]
set style line 1 lc rgb '#E41A1C' lt 1 lw 2 pt 7 ps 0.5   # Red
set style line 2 lc rgb '#377EB8' lt 1 lw 2 pt 5 ps 0.5   # Blue

plot "data/polling_perf.dat" using 1:2 with linespoints ls 1 title "Naive Polling", \
     "data/polling_perf.dat" using 1:3 with linespoints ls 2 title "Adaptive Batching"
