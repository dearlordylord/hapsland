target datalayout = "e-m:e-i8:8:32-i16:16:32-i64:64-i128:128-n32:64-S128"
target triple = "aarch64-unknown-linux-gnu"
%struct._IO_FILE = type { i32, i8*, i8*, i8*, i8*, i8*, i8*, i8*, i8*, i8*, i8*, i8*, %struct._IO_marker*, %struct._IO_FILE*, i32, i32, i64, i16, i8, [1 x i8], i8*, i64, %struct._IO_codecvt*, %struct._IO_wide_data*, %struct._IO_FILE*, i8*, i64, i32, [20 x i8] }
%struct._IO_marker = type opaque
%struct._IO_codecvt = type opaque
%struct._IO_wide_data = type opaque
%struct.IoEff = type { i64 ([2 x i64], i64*, %struct.IoWork*)*, i32 }
%struct.IoWork = type { i64, i64, i32, i64, i8*, i8*, i32, void (%struct.IoWork*)*, i64 ([2 x i64], %struct.IoWork*)*, i64, i64, i64, i16, %struct.IoWork* }
%struct.sigaction = type { %union.anon, %struct.__sigset_t, i32, void ()* }
%union.anon = type { void (i32)* }
%struct.__sigset_t = type { [16 x i64] }
%union.pthread_mutex_t = type { %struct.__pthread_mutex_s, [8 x i8] }
%struct.__pthread_mutex_s = type { i32, i32, i32, i32, i32, i32, %struct.__pthread_internal_list }
%struct.__pthread_internal_list = type { %struct.__pthread_internal_list*, %struct.__pthread_internal_list* }
%union.pthread_cond_t = type { %struct.__pthread_cond_s }
%struct.__pthread_cond_s = type { %union.__atomic_wide_counter, %union.__atomic_wide_counter, [2 x i32], [2 x i32], i32, i32, [2 x i32] }
%union.__atomic_wide_counter = type { i64 }
%struct.cpu_set_t = type { [16 x i64] }
%struct.Bank = type { i64, i32, i32, i32 }
%struct.timespec = type { i64, i64 }
%struct.timeval = type { i64, i64 }
%struct.fd_set = type { [16 x i64] }
%struct.stack_t = type { i8*, i32, i64 }
%union.pthread_attr_t = type { i64, [56 x i8] }
attributes #0 = { nounwind uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #1 = { argmemonly mustprogress nofree nosync nounwind willreturn }
attributes #2 = { cold noinline nounwind optsize uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #3 = { inaccessiblemem_or_argmemonly mustprogress nounwind willreturn "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #4 = { argmemonly mustprogress nofree nounwind readonly willreturn "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #5 = { nofree nounwind "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #6 = { mustprogress nofree nounwind willreturn "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #7 = { noreturn nounwind uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #8 = { inaccessiblememonly mustprogress nofree nounwind willreturn "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #9 = { inlinehint nofree norecurse nounwind uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #10 = { inlinehint nounwind uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #11 = { cold nofree noinline norecurse nounwind optsize uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #12 = { mustprogress nofree nosync nounwind readnone speculatable willreturn }
attributes #13 = { nofree noinline nounwind uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #14 = { argmemonly mustprogress nofree nounwind willreturn }
attributes #15 = { noreturn "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #16 = { nounwind "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #17 = { "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #18 = { noinline nounwind uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #19 = { inlinehint nofree nounwind uwtable "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #20 = { mustprogress nofree noinline norecurse nosync nounwind uwtable willreturn writeonly "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #21 = { inlinehint mustprogress nofree nosync nounwind uwtable willreturn writeonly "frame-pointer"="non-leaf" "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #22 = { mustprogress nofree nosync nounwind readnone willreturn "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #23 = { argmemonly mustprogress nofree nounwind willreturn writeonly }
attributes #24 = { nofree "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #25 = { noreturn nounwind "frame-pointer"="non-leaf" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="generic" "target-features"="+neon,+outline-atomics,+v8a" }
attributes #26 = { nofree nosync nounwind readnone speculatable willreturn }
attributes #27 = { nofree nosync nounwind readnone willreturn }
attributes #28 = { nounwind }
attributes #29 = { cold }
attributes #30 = { cold nounwind }
attributes #31 = { nounwind readonly willreturn }
attributes #32 = { noreturn nounwind }
attributes #33 = { nounwind readnone willreturn }
@wl_tab = external constant [1732 x i64 ([2 x i64], i64*, i32, i32, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64)*]
define i64 @WL_FID_DEFENSEHOST_INITIAL_K2484([2 x i64] %0, i64* noundef %1, i32 noundef %2, i32 noundef %3, i64 noundef %4, i64 noundef %5, i64 noundef %6, i64 noundef %7, i64 noundef %8, i64 noundef %9, i64 noundef %10, i64 noundef %11, i64 noundef %12, i64 noundef %13, i64 noundef %14, i64 noundef %15, i64 noundef %16, i64 noundef %17, i64 noundef %18, i64 noundef %19, i64 noundef %20, i64 noundef %21, i64 noundef %22, i64 noundef %23, i64 noundef %24, i64 noundef %25, i64 noundef %26, i64 noundef %27, i64 noundef %28, i64 noundef %29, i64 noundef %30, i64 noundef %31, i64 noundef %32, i64 noundef %33, i64 noundef %34, i64 noundef %35, i64 noundef %36, i64 noundef %37, i64 noundef %38, i64 noundef %39, i64 noundef %40, i64 noundef %41, i64 noundef %42, i64 noundef %43, i64 noundef %44, i64 noundef %45, i64 noundef %46, i64 noundef %47, i64 noundef %48, i64 noundef %49, i64 noundef %50, i64 noundef %51, i64 noundef %52, i64 noundef %53, i64 noundef %54, i64 noundef %55, i64 noundef %56, i64 noundef %57, i64 noundef %58, i64 noundef %59, i64 noundef %60, i64 noundef %61, i64 noundef %62, i64 noundef %63, i64 noundef %64, i64 noundef %65, i64 noundef %66, i64 noundef %67, i64 noundef %68, i64 noundef %69, i64 noundef %70, i64 noundef %71, i64 noundef %72, i64 noundef %73, i64 noundef %74, i64 noundef %75, i64 noundef %76, i64 noundef %77, i64 noundef %78, i64 noundef %79, i64 noundef %80, i64 noundef %81, i64 noundef %82, i64 noundef %83, i64 noundef %84, i64 noundef %85, i64 noundef %86, i64 noundef %87, i64 noundef %88, i64 noundef %89, i64 noundef %90, i64 noundef %91, i64 noundef %92, i64 noundef %93, i64 noundef %94, i64 noundef %95, i64 noundef %96, i64 noundef %97, i64 noundef %98, i64 noundef %99, i64 noundef %100, i64 noundef %101, i64 noundef %102, i64 noundef %103, i64 noundef %104, i64 noundef %105, i64 noundef %106, i64 noundef %107, i64 noundef %108, i64 noundef %109, i64 noundef %110, i64 noundef %111, i64 noundef %112, i64 noundef %113, i64 noundef %114, i64 noundef %115, i64 noundef %116, i64 noundef %117, i64 noundef %118) #18 {
  %120 = getelementptr inbounds i64, i64* %1, i64 -31
  %121 = load i64, i64* %120, align 8
  %122 = getelementptr inbounds i64, i64* %1, i64 -30
  %123 = load i64, i64* %122, align 8
  %124 = getelementptr inbounds i64, i64* %1, i64 -29
  %125 = load i64, i64* %124, align 8
  %126 = getelementptr inbounds i64, i64* %1, i64 -28
  %127 = load i64, i64* %126, align 8
  %128 = getelementptr inbounds i64, i64* %1, i64 -27
  %129 = load i64, i64* %128, align 8
  %130 = getelementptr inbounds i64, i64* %1, i64 -26
  %131 = load i64, i64* %130, align 8
  %132 = getelementptr inbounds i64, i64* %1, i64 -25
  %133 = load i64, i64* %132, align 8
  %134 = getelementptr inbounds i64, i64* %1, i64 -24
  %135 = load i64, i64* %134, align 8
  %136 = getelementptr inbounds i64, i64* %1, i64 -23
  %137 = load i64, i64* %136, align 8
  %138 = getelementptr inbounds i64, i64* %1, i64 -22
  %139 = load i64, i64* %138, align 8
  %140 = getelementptr inbounds i64, i64* %1, i64 -21
  %141 = load i64, i64* %140, align 8
  %142 = getelementptr inbounds i64, i64* %1, i64 -20
  %143 = load i64, i64* %142, align 8
  %144 = getelementptr inbounds i64, i64* %1, i64 -19
  %145 = load i64, i64* %144, align 8
  %146 = getelementptr inbounds i64, i64* %1, i64 -18
  %147 = load i64, i64* %146, align 8
  %148 = getelementptr inbounds i64, i64* %1, i64 -17
  %149 = load i64, i64* %148, align 8
  %150 = getelementptr inbounds i64, i64* %1, i64 -16
  %151 = load i64, i64* %150, align 8
  %152 = getelementptr inbounds i64, i64* %1, i64 -15
  %153 = load i64, i64* %152, align 8
  %154 = getelementptr inbounds i64, i64* %1, i64 -14
  %155 = load i64, i64* %154, align 8
  %156 = getelementptr inbounds i64, i64* %1, i64 -13
  %157 = load i64, i64* %156, align 8
  %158 = getelementptr inbounds i64, i64* %1, i64 -12
  %159 = load i64, i64* %158, align 8
  %160 = getelementptr inbounds i64, i64* %1, i64 -11
  %161 = load i64, i64* %160, align 8
  %162 = getelementptr inbounds i64, i64* %1, i64 -10
  %163 = load i64, i64* %162, align 8
  %164 = getelementptr inbounds i64, i64* %1, i64 -9
  %165 = load i64, i64* %164, align 8
  %166 = getelementptr inbounds i64, i64* %1, i64 -8
  %167 = load i64, i64* %166, align 8
  %168 = getelementptr inbounds i64, i64* %1, i64 -7
  %169 = load i64, i64* %168, align 8
  %170 = getelementptr inbounds i64, i64* %1, i64 -6
  %171 = load i64, i64* %170, align 8
  %172 = getelementptr inbounds i64, i64* %1, i64 -5
  %173 = load i64, i64* %172, align 8
  %174 = getelementptr inbounds i64, i64* %1, i64 -4
  %175 = load i64, i64* %174, align 8
  %176 = getelementptr inbounds i64, i64* %1, i64 -3
  %177 = load i64, i64* %176, align 8
  %178 = getelementptr inbounds i64, i64* %1, i64 -2
  %179 = load i64, i64* %178, align 8
  %180 = getelementptr inbounds i64, i64* %1, i64 -1
  %181 = load i64, i64* %180, align 8
  %182 = and i64 %149, 4294967295
  %183 = and i64 %4, 4294967295
  %184 = and i64 %5, 4294967295
  %185 = and i64 %6, 4294967295
  %186 = and i64 %7, 4294967295
  %187 = and i64 %8, 4294967295
  %188 = and i64 %11, 4294967295
  %189 = and i64 %12, 4294967295
  %190 = and i64 %13, 4294967295
  %191 = and i64 %17, 4294967295
  %192 = and i64 %18, 4294967295
  %193 = and i64 %19, 4294967295
  %194 = getelementptr inbounds i64, i64* %1, i64 -32
  %195 = load i64, i64* %194, align 8
  %196 = and i64 %195, 4294967295
  %197 = getelementptr inbounds [1732 x i64 ([2 x i64], i64*, i32, i32, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64)*], [1732 x i64 ([2 x i64], i64*, i32, i32, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64)*]* @wl_tab, i64 0, i64 %196
  %198 = load i64 ([2 x i64], i64*, i32, i32, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64)*, i64 ([2 x i64], i64*, i32, i32, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64)** %197, align 8
  %199 = musttail call i64 %198([2 x i64] %0, i64* noundef nonnull %194, i32 noundef %2, i32 noundef 73, i64 noundef %121, i64 noundef %123, i64 noundef %125, i64 noundef %127, i64 noundef %129, i64 noundef %131, i64 noundef undef, i64 noundef %133, i64 noundef %135, i64 noundef %137, i64 noundef %139, i64 noundef %141, i64 noundef %143, i64 noundef %145, i64 noundef %147, i64 noundef %182, i64 noundef %151, i64 noundef %153, i64 noundef %155, i64 noundef %157, i64 noundef %159, i64 noundef %161, i64 noundef %163, i64 noundef %165, i64 noundef %167, i64 noundef %169, i64 noundef %171, i64 noundef %173, i64 noundef %175, i64 noundef %177, i64 noundef %179, i64 noundef %181, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 160, i64 noundef 100, i64 noundef 72078484758855680, i64 noundef 72078484758855680, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 999, i64 noundef 72078484758855680, i64 noundef 0, i64 noundef 0, i64 noundef %183, i64 noundef %184, i64 noundef %185, i64 noundef %186, i64 noundef %187, i64 noundef %9, i64 noundef %188, i64 noundef %189, i64 noundef %190, i64 noundef %14, i64 noundef %15, i64 noundef %16, i64 noundef %191, i64 noundef %192, i64 noundef %193, i64 noundef %20, i64 noundef %21, i64 noundef %22, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef 0, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef, i64 noundef undef) #28
  ret i64 %199
}
