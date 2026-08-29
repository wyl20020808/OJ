package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ojplatform/judge-worker/internal/config"
	"github.com/ojplatform/judge-worker/internal/queueadapter"
	"github.com/ojplatform/judge-worker/internal/worker"
)

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		log.Printf("worker configuration rejected: %v", err)
		os.Exit(2)
	}
	redis, err := queueadapter.New(cfg.RedisURL)
	if err != nil {
		log.Printf("worker Redis configuration rejected: %v", err)
		os.Exit(2)
	}
	w := worker.New(cfg, redis, log.Default())
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)
	if err = w.Start(ctx); err != nil {
		log.Printf("worker dependency unavailable: %v", err)
		os.Exit(3)
	}
	_, _ = w.ServeHealth(ctx)
	<-signals
	if err = w.Drain(context.Background()); err != nil {
		os.Exit(4)
	}
	cancel()
}
